"use client";

import SignatureCanvas from "react-signature-canvas";
import { useRef } from "react";

type Props = {
  onSave: (data: string) => void;
  onCancel: () => void;
};

function SignaturePopup({ onSave, onCancel }: Props) {
  const ref = useRef<SignatureCanvas | null>(null);

  function handleSave() {
    if (!ref.current) return;

    // Bug fix #3: Guard against saving a blank (empty) canvas
    if (ref.current.isEmpty()) {
      alert("Please draw your signature before saving.");
      return;
    }

    const img = ref.current.getTrimmedCanvas().toDataURL("image/png");
    onSave(img);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 24,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        {/* Enhancement #19: Title label */}
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            fontSize: "16px",
            textAlign: "center",
            color: "#111827",
          }}
        >
          Draw your signature
        </p>

        <SignatureCanvas
          ref={ref}
          penColor="black"
          canvasProps={{
            width: 350,
            height: 160,
            style: { border: "1px solid #999", borderRadius: 4, display: "block" },
          }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => ref.current && ref.current.clear()}
            style={{
              padding: "6px 16px",
              background: "#6b7280",
              color: "white",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
            }}
          >
            Clear
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: "6px 16px",
              background: "#16a34a",
              color: "white",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
            }}
          >
            Save
          </button>

          <button
            onClick={onCancel}
            style={{
              padding: "6px 16px",
              background: "#dc2626",
              color: "white",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignaturePopup;
