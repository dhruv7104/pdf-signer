"use client";

import { useRef, useEffect } from "react";

export default function SignaturePopup({ onSave, onCancel }) {
  const canvasRef  = useRef(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef(null);

  // Fill canvas with background colour on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getPos(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    // Scale from CSS pixels → canvas backing-store pixels
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  function isEmpty() {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const { data } = canvas.getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height);
    // Any pixel darker than background (#fafafa = 250,250,250) means drawn
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mouse / touch handlers
  // ---------------------------------------------------------------------------
  function onStart(e) {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current   = getPos(e);
  }

  function onMove(e) {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();

    lastPos.current = pos;
  }

  function onEnd() {
    isDrawing.current = false;
    lastPos.current   = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function handleSave() {
    if (isEmpty()) {
      alert("Please draw your signature before saving.");
      return;
    }
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.35)",
      backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: "#ffffff",
        border: "1px solid #e0e0e0",
        borderRadius: "10px",
        padding: "24px",
        display: "flex", flexDirection: "column", gap: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        minWidth: "400px",
      }}>
        {/* Header */}
        <div>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#111111" }}>
            Draw Signature
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888888" }}>
            Click and drag (or touch and drag) to sign
          </p>
        </div>

        {/* Drawing canvas */}
        <canvas
          ref={canvasRef}
          width={450}
          height={180}
          onMouseDown={onStart}
          onMouseMove={onMove}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            border: "1px solid #e0e0e0",
            borderRadius: "6px",
            background: "#fafafa",
            cursor: "crosshair",
            touchAction: "none",   // prevents page scroll while signing on mobile
          }}
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={clearCanvas}
            style={{
              padding: "6px 14px", borderRadius: "6px",
              border: "1px solid #e0e0e0", background: "#ffffff",
              color: "#555555", fontSize: "13px", cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", borderRadius: "6px",
              border: "1px solid #e0e0e0", background: "#ffffff",
              color: "#555555", fontSize: "13px", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "6px 16px", borderRadius: "6px",
              border: "none", background: "#111111",
              color: "#ffffff", fontSize: "13px",
              fontWeight: "500", cursor: "pointer",
            }}
          >
            Save Signature
          </button>
        </div>
      </div>
    </div>
  );
}
