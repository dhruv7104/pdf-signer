import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import crypto from "crypto";
import mongoose, { Schema, model, models } from "mongoose";

export const runtime = "nodejs";

const MONGODB_URI = process.env.MONGODB_URI;

let isConnected = false;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is not set. Skipping MongoDB logging.");
    return;
  }
  if (isConnected) return;
  await mongoose.connect(MONGODB_URI);
  isConnected = true;
}

const auditSchema = new Schema({
  pdfId: { type: String, required: true },
  originalHash: { type: String, required: true },
  signedHash: { type: String, required: true },
  signedAt: { type: Date, default: Date.now },
});

const AuditLog = models.AuditLog || model("AuditLog", auditSchema);

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file = formData.get("pdf");
    const boxesJson = formData.get("boxes");

    if (!file) {
      return NextResponse.json({ error: "pdf file is required" }, { status: 400 });
    }

    if (!boxesJson) {
      return NextResponse.json({ error: "boxes payload is required" }, { status: 400 });
    }

    // Safely parse boxes JSON
    let boxes;
    try {
      boxes = JSON.parse(boxesJson);
    } catch {
      return NextResponse.json(
        { error: "boxes payload is not valid JSON" },
        { status: 400 }
      );
    }

    // Require at least one box with actual content
    const hasContent = boxes.some(
      (b) =>
        (b.fieldType === "signature" && b.signature?.length) ||
        (b.fieldType === "image"     && b.signature?.length) ||
        (b.fieldType === "text"      && b.value?.trim())     ||
        (b.fieldType === "date"      && b.value?.trim())     ||
        b.fieldType === "radio"
    );
    if (!hasContent) {
      return NextResponse.json(
        { error: "at least one field with content is required" },
        { status: 400 }
      );
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());

    const originalHash = crypto
      .createHash("sha256")
      .update(originalBuffer)
      .digest("hex");

    const pdfDoc = await PDFDocument.load(originalBuffer);

    // NOTE: Only page 0 is supported. Multi-page support requires
    // the client to pass a page index per box field.
    const page = pdfDoc.getPage(0);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const box of boxes) {
      const boxWidth = box.wPercent * pageWidth;
      const boxHeight = box.hPercent * pageHeight;

      // Convert top-left percentage coordinates → pdf-lib bottom-left origin
      const baseBoxX = box.xPercent * pageWidth;
      const boxTopFromTop = box.yPercent * pageHeight;
      const baseBoxY = pageHeight - boxTopFromTop - boxHeight;

      // SIGNATURE / IMAGE
      if (
        (box.fieldType === "signature" || box.fieldType === "image") &&
        box.signature
      ) {
        const base64Data = box.signature.split(",")[1] || "";
        const imgBytes = Buffer.from(base64Data, "base64");

        let img;
        if (box.signature.startsWith("data:image/jpeg")) {
          img = await pdfDoc.embedJpg(imgBytes);
        } else {
          img = await pdfDoc.embedPng(imgBytes);
        }

        const scale = Math.min(boxWidth / img.width, boxHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;

        // Center within box
        const drawX = baseBoxX + (boxWidth - drawWidth) / 2;
        const drawY = baseBoxY + (boxHeight - drawHeight) / 2;

        page.drawImage(img, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
      }

      // TEXT / DATE
      else if ((box.fieldType === "text" || box.fieldType === "date") && box.value) {
        const fontSize = Math.min(12, boxHeight * 0.6);
        const textX = baseBoxX + 4;
        const textY = baseBoxY + (boxHeight - fontSize) / 2;

        page.drawText(box.value, {
          x: textX,
          y: textY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }

      // RADIO
      else if (box.fieldType === "radio") {
        const radius = Math.min(boxWidth, boxHeight) / 2.5;
        const centerX = baseBoxX + boxWidth / 2;
        const centerY = baseBoxY + boxHeight / 2;

        page.drawCircle({
          x: centerX,
          y: centerY,
          size: radius,
          borderWidth: 1,
          borderColor: rgb(0, 0, 0),
        });

        if (box.value === "checked") {
          page.drawCircle({
            x: centerX,
            y: centerY,
            size: radius / 2,
            color: rgb(0, 0, 0),
          });
        }
      }
    }

    const signedPdfBytes = await pdfDoc.save();
    const signedBuffer = Buffer.from(signedPdfBytes);

    const signedHash = crypto
      .createHash("sha256")
      .update(signedBuffer)
      .digest("hex");

    const pdfId = crypto.randomUUID();

    try {
      await connectDB();
      if (isConnected) {
        await AuditLog.create({ pdfId, originalHash, signedHash });
      }
    } catch (dbErr) {
      console.error("Failed to save audit log:", dbErr);
      // Non-fatal — continue even if DB logging fails
    }

    return new NextResponse(signedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="signed.pdf"',
        "X-Original-Hash": originalHash,
        "X-Signed-Hash": signedHash,
        "X-Pdf-Id": pdfId,
      },
    });
  } catch (err) {
    console.error("ERROR in /api/sign-pdf:", err);
    return NextResponse.json({ error: "something went wrong" }, { status: 500 });
  }
}
