"use client";

import React, { useState, useRef, useEffect } from "react";
import SignaturePopup from "../components/SignaturePopup";

const FIELD_LABELS = {
  signature: "Signature",
  text: "Text",
  image: "Image",
  date: "Date",
  radio: "Radio",
};

const buttonStyle = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontSize: "13px",
};

// ---------------------------------------------------------------------------
// Lazy-load pdfjs-dist (client-only, singleton)
// ---------------------------------------------------------------------------
let _pdfjsLib = null;
let _pdfjsLoading = null;

async function getPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  if (_pdfjsLoading) return _pdfjsLoading;

  _pdfjsLoading = import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
    _pdfjsLib = lib;
    return lib;
  });

  return _pdfjsLoading;
}

// ---------------------------------------------------------------------------

export default function PdfViewer() {
  const [pdfFile, setPdfFile] = useState(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [boxes, setBoxes] = useState([]);
  const [activeBoxId, setActiveBoxId] = useState(null);

  const [originalHash, setOriginalHash] = useState(null);
  const [signedHash, setSignedHash] = useState(null);
  const [pdfId, setPdfId] = useState(null);

  const [isSigning, setIsSigning] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  const pdfAreaRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const draggingBoxIdRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // ---------------------------------------------------------------------------
  // Render PDF page 1 to canvas using pdfjs-dist
  // Canvas fills 100% CSS width with auto height → exact aspect ratio of the PDF.
  // Box percentage coords therefore map 1-to-1 with the PDF coordinate space.
  // ---------------------------------------------------------------------------
  async function renderPdfToCanvas(file) {
    const canvas = pdfCanvasRef.current;
    const container = pdfAreaRef.current;
    if (!canvas || !container) return;

    setIsLoadingPdf(true);
    try {
      const lib = await getPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await lib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdfDoc.getPage(1);

      // Scale to fit container width at 2× for retina sharpness
      const containerWidth = container.clientWidth || 800;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (containerWidth / baseViewport.width) * 2;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      setHasPdf(true);
    } catch (err) {
      console.error("Failed to render PDF:", err);
      alert("Could not render PDF preview. Please try another file.");
    } finally {
      setIsLoadingPdf(false);
    }
  }

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------
  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];

    if (!file) {
      setPdfFile(null);
      setHasPdf(false);
      setBoxes([]);
      setOriginalHash(null);
      setSignedHash(null);
      setPdfId(null);
      const canvas = pdfCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    setPdfFile(file);
    setHasPdf(false);
    setBoxes([]);
    setOriginalHash(null);
    setSignedHash(null);
    setPdfId(null);
    renderPdfToCanvas(file);
  }

  // ---------------------------------------------------------------------------
  // Field boxes
  // ---------------------------------------------------------------------------
  function addFieldBox(fieldType) {
    if (!hasPdf) {
      alert("Please upload a PDF first.");
      return;
    }

    const base = {
      id: Date.now(),
      fieldType,
      xPercent: 0.35,
      yPercent: 0.4,
      wPercent: 0.3,
      hPercent: 0.08,
    };

    if (fieldType === "radio") {
      base.wPercent = 0.05;
      base.hPercent = 0.03;
    }

    setBoxes((old) => [...old, base]);
  }

  function deleteBox(id) {
    setBoxes((old) => old.filter((b) => b.id !== id));
  }

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------
  function handleBoxMouseDown(e, id) {
    e.preventDefault();
    if (!pdfAreaRef.current) return;

    const areaRect = pdfAreaRef.current.getBoundingClientRect();
    const currentBox = boxes.find((b) => b.id === id);
    if (!currentBox) return;

    dragOffsetRef.current = {
      x: e.clientX - (areaRect.left + currentBox.xPercent * areaRect.width),
      y: e.clientY - (areaRect.top + currentBox.yPercent * areaRect.height),
    };

    draggingBoxIdRef.current = id;
  }

  useEffect(() => {
    function handleMouseMove(e) {
      const activeId = draggingBoxIdRef.current;
      if (activeId === null) return;
      if (!pdfAreaRef.current) return;

      const areaRect = pdfAreaRef.current.getBoundingClientRect();

      setBoxes((old) => {
        const box = old.find((b) => b.id === activeId);
        if (!box) return old;

        const boxWidthPx = box.wPercent * areaRect.width;
        const boxHeightPx = box.hPercent * areaRect.height;

        let newLeftPx = e.clientX - areaRect.left - dragOffsetRef.current.x;
        let newTopPx = e.clientY - areaRect.top - dragOffsetRef.current.y;

        if (newLeftPx < 0) newLeftPx = 0;
        if (newTopPx < 0) newTopPx = 0;
        if (newLeftPx > areaRect.width - boxWidthPx)
          newLeftPx = areaRect.width - boxWidthPx;
        if (newTopPx > areaRect.height - boxHeightPx)
          newTopPx = areaRect.height - boxHeightPx;

        return old.map((b) =>
          b.id === activeId
            ? {
                ...b,
                xPercent: newLeftPx / areaRect.width,
                yPercent: newTopPx / areaRect.height,
              }
            : b
        );
      });
    }

    function handleMouseUp() {
      draggingBoxIdRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Download signed PDF
  // ---------------------------------------------------------------------------
  async function handleDownloadSigned() {
    if (!pdfFile) { alert("No PDF selected"); return; }
    if (boxes.length === 0) { alert("Add at least one field on the PDF."); return; }

    const hasSignature = boxes.some(
      (b) => b.fieldType === "signature" && b.signature
    );
    if (!hasSignature) {
      alert("Please draw and save a signature field.");
      return;
    }

    const form = new FormData();
    form.append("pdf", pdfFile);
    form.append(
      "boxes",
      JSON.stringify(
        boxes.map((b) => ({
          fieldType: b.fieldType,
          xPercent: b.xPercent,
          yPercent: b.yPercent,
          wPercent: b.wPercent,
          hPercent: b.hPercent,
          signature: b.signature || null,
          value: b.value || "",
        }))
      )
    );

    setIsSigning(true);
    try {
      const res = await fetch("/api/sign-pdf", { method: "POST", body: form });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to sign PDF: ${data.error || res.statusText}`);
        return;
      }

      setOriginalHash(res.headers.get("x-original-hash"));
      setSignedHash(res.headers.get("x-signed-hash"));
      setPdfId(res.headers.get("x-pdf-id"));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "signed.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Could not connect to backend");
    } finally {
      setIsSigning(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        alignItems: "center",
      }}
    >
      <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>
        BoloSign – PDF Signer
      </h1>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept="application/pdf" onChange={handleFileChange} />

        <button onClick={() => addFieldBox("signature")} style={buttonStyle}>Signature Field</button>
        <button onClick={() => addFieldBox("text")} style={buttonStyle}>Text Field</button>
        <button onClick={() => addFieldBox("image")} style={buttonStyle}>Image Field</button>
        <button onClick={() => addFieldBox("date")} style={buttonStyle}>Date Field</button>
        <button onClick={() => addFieldBox("radio")} style={buttonStyle}>Radio Button</button>

        <button
          onClick={handleDownloadSigned}
          disabled={isSigning}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            background: isSigning ? "#86efac" : "#16a34a",
            color: "white",
            cursor: isSigning ? "not-allowed" : "pointer",
            fontSize: "13px",
          }}
        >
          {isSigning ? "Signing…" : "Download Signed PDF"}
        </button>
      </div>

      {/* Audit hashes */}
      {(originalHash || signedHash || pdfId) && (
        <div
          style={{
            padding: "12px",
            background: "#f3f4f6",
            borderRadius: "8px",
            maxWidth: "800px",
            width: "100%",
            fontSize: "12px",
            wordBreak: "break-all",
          }}
        >
          {originalHash && <><p><strong>Original SHA-256:</strong></p><p>{originalHash}</p></>}
          {signedHash && <><p style={{ marginTop: 8 }}><strong>Signed SHA-256:</strong></p><p>{signedHash}</p></>}
          {pdfId && <><p style={{ marginTop: 8 }}><strong>PDF ID:</strong></p><p>{pdfId}</p></>}
        </div>
      )}

      {/* PDF canvas + overlay */}
      <div
        style={{
          marginTop: "8px",
          border: "1px solid #ddd",
          padding: "8px",
          maxWidth: "800px",
          width: "100%",
          display: pdfFile ? "block" : "none",
        }}
      >
        {isLoadingPdf && (
          <p style={{ textAlign: "center", padding: "16px", color: "#6b7280" }}>
            Loading PDF…
          </p>
        )}

        <div
          ref={pdfAreaRef}
          style={{
            position: "relative",
            width: "100%",
            display: isLoadingPdf ? "none" : "block",
          }}
        >
          {/* Canvas: pixel-perfect PDF rendering — correct aspect ratio guaranteed */}
          <canvas
            ref={pdfCanvasRef}
            style={{ display: "block", width: "100%", height: "auto" }}
          />

          {/* Draggable field overlays */}
          {boxes.map((box) => (
            <div
              key={box.id}
              onMouseDown={(e) => handleBoxMouseDown(e, box.id)}
              onDoubleClick={() => {
                if (box.fieldType === "signature") {
                  setActiveBoxId(box.id);
                } else if (box.fieldType === "text") {
                  const val = prompt("Enter text:", box.value || "");
                  if (val !== null)
                    setBoxes((old) =>
                      old.map((b) => (b.id === box.id ? { ...b, value: val } : b))
                    );
                } else if (box.fieldType === "date") {
                  const val = prompt(
                    "Enter date (YYYY-MM-DD):",
                    box.value || new Date().toISOString().split("T")[0]
                  );
                  if (val !== null) {
                    if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                      alert("Invalid format. Please use YYYY-MM-DD.");
                      return;
                    }
                    setBoxes((old) =>
                      old.map((b) => (b.id === box.id ? { ...b, value: val } : b))
                    );
                  }
                } else if (box.fieldType === "image") {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.style.display = "none";
                  document.body.appendChild(input);
                  input.onchange = (event) => {
                    const file = event.target.files && event.target.files[0];
                    document.body.removeChild(input);
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setBoxes((old) =>
                        old.map((b) =>
                          b.id === box.id ? { ...b, signature: reader.result } : b
                        )
                      );
                    reader.readAsDataURL(file);
                  };
                  input.click();
                } else if (box.fieldType === "radio") {
                  setBoxes((old) =>
                    old.map((b) =>
                      b.id === box.id
                        ? { ...b, value: b.value === "checked" ? "" : "checked" }
                        : b
                    )
                  );
                }
              }}
              style={{
                position: "absolute",
                left: `${box.xPercent * 100}%`,
                top: `${box.yPercent * 100}%`,
                width: `${box.wPercent * 100}%`,
                height: `${box.hPercent * 100}%`,
                border: "2px dashed #ef4444",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "move",
                userSelect: "none",
                boxSizing: "border-box",
              }}
            >
              {/* Delete button */}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deleteBox(box.id); }}
                title="Remove field"
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                  padding: 0,
                }}
              >
                ×
              </button>

              {/* Content preview */}
              {box.fieldType === "signature" &&
                (box.signature ? (
                  <img src={box.signature} alt="Signature" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ color: "#6b7280", pointerEvents: "none" }}>{FIELD_LABELS.signature}</span>
                ))}

              {box.fieldType === "text" && (
                <span style={{ color: box.value ? "#111827" : "#6b7280", pointerEvents: "none" }}>
                  {box.value || FIELD_LABELS.text}
                </span>
              )}

              {box.fieldType === "date" && (
                <span style={{ color: box.value ? "#111827" : "#6b7280", pointerEvents: "none" }}>
                  {box.value || FIELD_LABELS.date}
                </span>
              )}

              {box.fieldType === "image" &&
                (box.signature ? (
                  <img src={box.signature} alt="Image" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ color: "#6b7280", pointerEvents: "none" }}>{FIELD_LABELS.image}</span>
                ))}

              {box.fieldType === "radio" && (
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: "2px solid #000",
                    background: box.value === "checked" ? "#000" : "transparent",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Signature drawing popup */}
      {activeBoxId !== null && (
        <SignaturePopup
          onSave={(img) => {
            setBoxes((old) =>
              old.map((b) => (b.id === activeBoxId ? { ...b, signature: img } : b))
            );
            setActiveBoxId(null);
          }}
          onCancel={() => setActiveBoxId(null)}
        />
      )}
    </main>
  );
}
