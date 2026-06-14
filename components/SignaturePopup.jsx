"use client";

import SignatureCanvas from "react-signature-canvas";
import { useRef } from "react";

export default function SignaturePopup({ onSave, onCancel }) {
  const ref = useRef(null);

  function handleSave() {
    if (!ref.current) return;
    if (ref.current.isEmpty()) {
      alert("Please draw your signature before saving.");
      return;
    }
    onSave(ref.current.getTrimmedCanvas().toDataURL("image/png"));
  }

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
        minWidth: "380px",
      }}>
        {/* Header */}
        <div>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#111111" }}>
            Draw Signature
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888888" }}>
            Use your mouse or trackpad to sign
          </p>
        </div>

        {/* Canvas */}
        <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", overflow: "hidden" }}>
          <SignatureCanvas
            ref={ref}
            penColor="#111111"
            canvasProps={{
              width: 350,
              height: 160,
              style: { display: "block", background: "#fafafa" },
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={() => ref.current && ref.current.clear()}
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
