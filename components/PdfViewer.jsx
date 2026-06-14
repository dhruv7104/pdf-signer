"use client";

import React, { useState, useRef, useEffect } from "react";
import SignaturePopup from "../components/SignaturePopup";


// ---------------------------------------------------------------------------
// pdfjs-dist singleton loader
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
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: "#f5f5f5",
  surface: "#ffffff",
  border: "#e0e0e0",
  borderDark: "#c8c8c8",
  textPrimary: "#111111",
  textSecondary: "#555555",
  textMuted: "#999999",
  primary: "#111111",
  primaryHover: "#333333",
  danger: "#cc2200",
};

const fieldTypes = [
  { type: "signature", label: "Signature" },
  { type: "text",      label: "Text"      },
  { type: "image",     label: "Image"     },
  { type: "date",      label: "Date"      },
  { type: "radio",     label: "Radio"     },
];

// ---------------------------------------------------------------------------

export default function PdfViewer() {
  const [pdfFile, setPdfFile]       = useState(null);
  const [fileName, setFileName]     = useState("");
  const [hasPdf, setHasPdf]         = useState(false);
  const [boxes, setBoxes]           = useState([]);
  const [activeBoxId, setActiveBoxId] = useState(null);

  const [originalHash, setOriginalHash] = useState(null);
  const [signedHash, setSignedHash]     = useState(null);
  const [pdfId, setPdfId]               = useState(null);

  const [isSigning, setIsSigning]       = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  const pdfAreaRef      = useRef(null);
  const pdfCanvasRef    = useRef(null);
  const draggingBoxIdRef = useRef(null);
  const dragOffsetRef    = useRef({ x: 0, y: 0 });
  // Store the file to render — read by useEffect after DOM commit
  const pendingRenderRef = useRef(null);

  // ---------------------------------------------------------------------------
  // PDF rendering — canvas gives exact aspect ratio for 1:1 coordinate mapping
  // ---------------------------------------------------------------------------
  async function renderPdfToCanvas(file) {
    const canvas    = pdfCanvasRef.current;
    const container = pdfAreaRef.current;
    if (!canvas || !container) {
      console.error("Canvas or container ref is null — cannot render PDF");
      return;
    }

    setIsLoadingPdf(true);
    try {
      const lib         = await getPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc      = await lib.getDocument({ data: arrayBuffer }).promise;
      const page        = await pdfDoc.getPage(1);

      // clientWidth is 0 when display:none; fall back to 800px
      const containerWidth = container.clientWidth || 800;
      const baseViewport   = page.getViewport({ scale: 1 });
      const scale          = (containerWidth / baseViewport.width) * 2;
      const viewport       = page.getViewport({ scale });

      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      setHasPdf(true);
    } catch (err) {
      console.error("Failed to render PDF:", err);
      alert("Could not render PDF. Please try another file.");
    } finally {
      setIsLoadingPdf(false);
    }
  }

  // Fire renderPdfToCanvas AFTER React has committed the DOM update
  // (so canvas refs are guaranteed to be mounted)
  useEffect(() => {
    if (pendingRenderRef.current) {
      const file = pendingRenderRef.current;
      pendingRenderRef.current = null;
      renderPdfToCanvas(file);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile]);

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------
  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setPdfFile(null); setFileName(""); setHasPdf(false); setBoxes([]);
      setOriginalHash(null); setSignedHash(null); setPdfId(null);
      const canvas = pdfCanvasRef.current;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      return;
    }
    // Store file in ref BEFORE calling setPdfFile.
    // useEffect watches pdfFile and fires renderPdfToCanvas after DOM commits,
    // ensuring canvas refs are valid.
    pendingRenderRef.current = file;
    setPdfFile(file);
    setFileName(file.name);
    setHasPdf(false);
    setBoxes([]);
    setOriginalHash(null); setSignedHash(null); setPdfId(null);
  }

  // ---------------------------------------------------------------------------
  // Field management
  // ---------------------------------------------------------------------------
  function addFieldBox(fieldType) {
    if (!hasPdf) { alert("Please upload a PDF first."); return; }
    const base = {
      id: Date.now(), fieldType,
      xPercent: 0.35, yPercent: 0.4, wPercent: 0.3, hPercent: 0.08,
    };
    if (fieldType === "radio") { base.wPercent = 0.05; base.hPercent = 0.03; }
    setBoxes((old) => [...old, base]);
  }

  function deleteBox(id) {
    setBoxes((old) => old.filter((b) => b.id !== id));
  }

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------
  function handleBoxMouseDown(e, id) {
    e.preventDefault();
    if (!pdfAreaRef.current) return;
    const areaRect   = pdfAreaRef.current.getBoundingClientRect();
    const currentBox = boxes.find((b) => b.id === id);
    if (!currentBox) return;
    dragOffsetRef.current = {
      x: e.clientX - (areaRect.left + currentBox.xPercent * areaRect.width),
      y: e.clientY - (areaRect.top  + currentBox.yPercent * areaRect.height),
    };
    draggingBoxIdRef.current = id;
  }

  useEffect(() => {
    function onMove(e) {
      const activeId = draggingBoxIdRef.current;
      if (activeId === null || !pdfAreaRef.current) return;
      const areaRect = pdfAreaRef.current.getBoundingClientRect();

      setBoxes((old) => {
        const box = old.find((b) => b.id === activeId);
        if (!box) return old;
        const bw = box.wPercent * areaRect.width;
        const bh = box.hPercent * areaRect.height;
        let lx = e.clientX - areaRect.left - dragOffsetRef.current.x;
        let ly = e.clientY - areaRect.top  - dragOffsetRef.current.y;
        if (lx < 0) lx = 0;
        if (ly < 0) ly = 0;
        if (lx > areaRect.width  - bw) lx = areaRect.width  - bw;
        if (ly > areaRect.height - bh) ly = areaRect.height - bh;
        return old.map((b) =>
          b.id === activeId
            ? { ...b, xPercent: lx / areaRect.width, yPercent: ly / areaRect.height }
            : b
        );
      });
    }
    function onUp() { draggingBoxIdRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ---------------------------------------------------------------------------
  // Download signed PDF
  // ---------------------------------------------------------------------------
  async function handleDownloadSigned() {
    if (!pdfFile)          { alert("No PDF selected.");              return; }
    if (boxes.length === 0) { alert("Add at least one field.");       return; }
    if (!boxes.some((b) => b.fieldType === "signature" && b.signature)) {
      alert("Please draw and save a signature field first."); return;
    }

    const form = new FormData();
    form.append("pdf", pdfFile);
    form.append("boxes", JSON.stringify(
      boxes.map((b) => ({
        fieldType: b.fieldType,
        xPercent: b.xPercent, yPercent: b.yPercent,
        wPercent: b.wPercent, hPercent: b.hPercent,
        signature: b.signature || null, value: b.value || "",
      }))
    ));

    setIsSigning(true);
    try {
      const res = await fetch("/api/sign-pdf", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error: ${data.error || res.statusText}`);
        return;
      }
      setOriginalHash(res.headers.get("x-original-hash"));
      setSignedHash(res.headers.get("x-signed-hash"));
      setPdfId(res.headers.get("x-pdf-id"));

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "signed.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    } finally {
      setIsSigning(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Double-click handlers per field type
  // ---------------------------------------------------------------------------
  function handleBoxDoubleClick(box) {
    if (box.fieldType === "signature") {
      setActiveBoxId(box.id);

    } else if (box.fieldType === "text") {
      const val = prompt("Enter text:", box.value || "");
      if (val !== null)
        setBoxes((old) => old.map((b) => b.id === box.id ? { ...b, value: val } : b));

    } else if (box.fieldType === "date") {
      const val = prompt("Enter date (YYYY-MM-DD):", box.value || new Date().toISOString().split("T")[0]);
      if (val !== null) {
        if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) { alert("Use format YYYY-MM-DD."); return; }
        setBoxes((old) => old.map((b) => b.id === box.id ? { ...b, value: val } : b));
      }

    } else if (box.fieldType === "image") {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*"; input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = (ev) => {
        const file = ev.target.files && ev.target.files[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () =>
          setBoxes((old) => old.map((b) => b.id === box.id ? { ...b, signature: reader.result } : b));
        reader.readAsDataURL(file);
      };
      input.click();

    } else if (box.fieldType === "radio") {
      setBoxes((old) =>
        old.map((b) => b.id === box.id ? { ...b, value: b.value === "checked" ? "" : "checked" } : b)
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        height: "56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Simple icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textPrimary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, letterSpacing: "-0.01em" }}>
            PDF Signer
          </span>
        </div>
        <span style={{ fontSize: "12px", color: C.textMuted }}>
          Digitally sign and annotate documents
        </span>
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main style={{
        maxWidth: "860px",
        margin: "0 auto",
        padding: "28px 16px 48px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>

        {/* ── Toolbar card ─────────────────────────────────── */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}>

          {/* Upload */}
          <label style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "6px",
            border: `1px solid ${C.borderDark}`,
            background: C.surface, color: C.textPrimary,
            fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap",
            fontWeight: "500",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {fileName ? "Change PDF" : "Upload PDF"}
            <input type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: "none" }} />
          </label>

          {/* File name badge */}
          {fileName && (
            <span style={{
              fontSize: "12px", color: C.textSecondary,
              background: "#f0f0f0", borderRadius: "4px",
              padding: "3px 8px", maxWidth: "180px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={fileName}>
              {fileName}
            </span>
          )}

          {/* Separator */}
          {hasPdf && (
            <div style={{ width: "1px", height: "20px", background: C.border, margin: "0 4px" }} />
          )}

          {/* Field buttons — only visible when PDF is loaded */}
          {hasPdf && fieldTypes.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => addFieldBox(type)}
              style={{
                padding: "5px 10px", borderRadius: "6px",
                border: `1px solid ${C.border}`,
                background: C.surface, color: C.textSecondary,
                fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              + {label}
            </button>
          ))}

          {/* Spacer */}
          <div style={{ flexGrow: 1 }} />

          {/* Download CTA */}
          {hasPdf && (
            <button
              onClick={handleDownloadSigned}
              disabled={isSigning}
              style={{
                padding: "6px 16px", borderRadius: "6px",
                border: "none",
                background: isSigning ? "#555" : C.primary,
                color: "#ffffff",
                fontSize: "13px", fontWeight: "500",
                cursor: isSigning ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: "6px",
                opacity: isSigning ? 0.7 : 1,
              }}
            >
              {isSigning ? (
                "Signing…"
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Signed PDF
                </>
              )}
            </button>
          )}
        </div>

        {/* ── Empty state ───────────────────────────────────── */}
        {!pdfFile && (
          <div style={{
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: "8px",
            padding: "64px 32px",
            textAlign: "center",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style={{ color: C.textMuted, fontSize: "14px", margin: 0 }}>
              Upload a PDF to get started
            </p>
            <p style={{ color: C.textMuted, fontSize: "12px", marginTop: "6px" }}>
              Place signature, text, image, date, or radio fields — then download the signed document
            </p>
          </div>
        )}

        {/* ── Loading indicator ─────────────────────────────── */}
        {isLoadingPdf && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
            padding: "32px", textAlign: "center", color: C.textMuted, fontSize: "13px",
          }}>
            Loading PDF…
          </div>
        )}

        {/* ── PDF canvas + overlay ──────────────────────────── */}
        {/* Always in DOM so refs (pdfAreaRef, pdfCanvasRef) are never null.
            Visibility toggled via display instead of conditional rendering. */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          display: pdfFile && !isLoadingPdf ? "block" : "none",
        }}>
            <div ref={pdfAreaRef} style={{ position: "relative", width: "100%" }}>
              {/* PDF canvas — width:100%/height:auto preserves true PDF aspect ratio */}
              <canvas
                ref={pdfCanvasRef}
                style={{ display: "block", width: "100%", height: "auto" }}
              />

              {/* Field overlays */}
              {boxes.map((box) => (
                <div
                  key={box.id}
                  onMouseDown={(e) => handleBoxMouseDown(e, box.id)}
                  onDoubleClick={() => handleBoxDoubleClick(box)}
                  style={{
                    position: "absolute",
                    left:   `${box.xPercent * 100}%`,
                    top:    `${box.yPercent * 100}%`,
                    width:  `${box.wPercent * 100}%`,
                    height: `${box.hPercent * 100}%`,
                    border: "1.5px dashed #3b82f6",
                    borderRadius: "3px",
                    background: "rgba(59,130,246,0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
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
                      position: "absolute", top: -8, right: -8,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#555", color: "#fff",
                      border: "none", cursor: "pointer",
                      fontSize: "10px", lineHeight: "16px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      zIndex: 10, padding: 0,
                    }}
                  >×</button>

                  {/* Content preview */}
                  {box.fieldType === "signature" && (
                    box.signature
                      ? <img src={box.signature} alt="sig" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <span style={{ color: "#3b82f6", fontSize: "11px", pointerEvents: "none", fontWeight: 500 }}>Signature</span>
                  )}
                  {box.fieldType === "text" && (
                    <span style={{ color: box.value ? C.textPrimary : "#94a3b8", fontSize: "11px", pointerEvents: "none" }}>
                      {box.value || "Text"}
                    </span>
                  )}
                  {box.fieldType === "date" && (
                    <span style={{ color: box.value ? C.textPrimary : "#94a3b8", fontSize: "11px", pointerEvents: "none" }}>
                      {box.value || "Date"}
                    </span>
                  )}
                  {box.fieldType === "image" && (
                    box.signature
                      ? <img src={box.signature} alt="img" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <span style={{ color: "#94a3b8", fontSize: "11px", pointerEvents: "none" }}>Image</span>
                  )}
                  {box.fieldType === "radio" && (
                    <div style={{
                      width: 12, height: 12, borderRadius: "50%",
                      border: "1.5px solid #555",
                      background: box.value === "checked" ? "#555" : "transparent",
                      pointerEvents: "none",
                    }} />
                  )}
                </div>
              ))}
            </div>
        </div>

        {/* ── Audit hashes ──────────────────────────────────── */}
        {(originalHash || signedHash || pdfId) && (
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}>
            <p style={{ margin: 0, fontSize: "11px", fontWeight: "600", color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Audit Trail
            </p>
            {originalHash && (
              <div>
                <p style={{ margin: "0 0 2px", fontSize: "11px", color: C.textMuted }}>Original SHA-256</p>
                <p style={{ margin: 0, fontSize: "11px", color: C.textSecondary, wordBreak: "break-all", fontFamily: "var(--font-geist-mono), monospace" }}>{originalHash}</p>
              </div>
            )}
            {signedHash && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px" }}>
                <p style={{ margin: "0 0 2px", fontSize: "11px", color: C.textMuted }}>Signed SHA-256</p>
                <p style={{ margin: 0, fontSize: "11px", color: C.textSecondary, wordBreak: "break-all", fontFamily: "var(--font-geist-mono), monospace" }}>{signedHash}</p>
              </div>
            )}
            {pdfId && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px" }}>
                <p style={{ margin: "0 0 2px", fontSize: "11px", color: C.textMuted }}>Document ID</p>
                <p style={{ margin: 0, fontSize: "11px", color: C.textSecondary, fontFamily: "var(--font-geist-mono), monospace" }}>{pdfId}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
