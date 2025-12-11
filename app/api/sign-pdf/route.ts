import { NextRequest, NextResponse } from "next/server";
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

type BoxInput = {
  fieldType: "signature" | "text" | "image" | "date" | "radio";
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
  signature: string | null;
  value: string;
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("pdf") as File | null;
    const boxesJson = formData.get("boxes") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "pdf file is required" },
        { status: 400 }
      );
    }

    if (!boxesJson) {
      return NextResponse.json(
        { error: "boxes payload is required" },
        { status: 400 }
      );
    }

    const boxes = JSON.parse(boxesJson) as BoxInput[];

    if (
      !boxes.some(
        (b) => b.fieldType === "signature" && b.signature && b.signature.length
      )
    ) {
      return NextResponse.json(
        { error: "at least one signature is required" },
        { status: 400 }
      );
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());

    const originalHash = crypto
      .createHash("sha256")
      .update(originalBuffer)
      .digest("hex");

    const pdfDoc = await PDFDocument.load(originalBuffer);
    const page = pdfDoc.getPage(0);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

   for (const box of boxes) {
        const boxWidth = box.wPercent * pageWidth;
        const boxHeight = box.hPercent * pageHeight;

        // base positions from percentages
        const baseBoxX = box.xPercent * pageWidth;
        const boxTopFromTop = box.yPercent * pageHeight;
        const baseBoxY = pageHeight - boxTopFromTop - boxHeight;

        // 🔽 per-type calibrated X & Y (tweak these multipliers if needed)
        const signatureBoxX = baseBoxX;
        const imageBoxX     = baseBoxX;

        // text field horizontal shift
        const textBoxX      = baseBoxX + boxWidth * 0.3;
        const dateBoxX      = baseBoxX + boxWidth * 0.3;

        // radio stays centered for now
        const radioBoxX     = baseBoxX;

        // vertical offsets
        const signatureBoxY = baseBoxY - boxHeight * 0.95;
        const imageBoxY     = baseBoxY - boxHeight * 0.95;
        const textBoxY      = baseBoxY - boxHeight * 0.95;
        const dateBoxY      = baseBoxY - boxHeight * 0.95;
        const radioBoxY     = baseBoxY - boxHeight * 2.6;


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

          const imgWidth = img.width;
          const imgHeight = img.height;
          const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);

          const drawWidth = imgWidth * scale;
          const drawHeight = imgHeight * scale;

          const useX = box.fieldType === "signature" ? signatureBoxX : imageBoxX;
          const useY = box.fieldType === "signature" ? signatureBoxY : imageBoxY;

          const drawX = useX + (boxWidth - drawWidth) / 2;    // horizontally centered in its box
          const drawY = useY + (boxHeight - drawHeight) / 2;  // vertically centered in its box

          page.drawImage(img, {
            x: drawX,
            y: drawY,
            width: drawWidth,
            height: drawHeight,
          });
        }
        // TEXT / DATE
        else if (
          (box.fieldType === "text" || box.fieldType === "date") &&
          box.value
        ) {
          const fontSize = 12;

          const useX = box.fieldType === "text" ? textBoxX : dateBoxX;
          const useY = box.fieldType === "text" ? textBoxY : dateBoxY;

          const textX = useX + 4; // small left padding
          const textY = useY + boxHeight / 2 - fontSize / 2;

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
          const centerX = radioBoxX + boxWidth / 2;
          const centerY = radioBoxY + boxHeight / 2;

          page.drawCircle({
            x: centerX,
            y: centerY,
            size: radius,
            borderWidth: 1,
            borderColor: rgb(0, 0, 0),
          });

          page.drawCircle({
            x: centerX,
            y: centerY,
            size: radius / 2,
            color: rgb(0, 0, 0),
          });
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
        await AuditLog.create({
          pdfId,
          originalHash,
          signedHash,
        });
      }
    } catch (dbErr) {
      console.error("Failed to save audit log:", dbErr);
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
    return NextResponse.json(
      { error: "something went wrong" },
      { status: 500 }
    );
  }
}
