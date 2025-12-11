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
    if (ref.current) {
      const img = ref.current.getTrimmedCanvas().toDataURL("image/png");
      onSave(img);
    }
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
          padding: 20,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <SignatureCanvas
          ref={ref}
          penColor="black"
          canvasProps={{
            width: 350,
            height: 160,
            style: { border: "1px solid #999", borderRadius: 4 },
          }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => ref.current && ref.current.clear()}
            style={{
              padding: "6px 12px",
              background: "#6b7280",
              color: "white",
              borderRadius: 4,
            }}
          >
            Clear
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: "6px 12px",
              background: "green",
              color: "white",
              borderRadius: 4,
            }}
          >
            Save
          </button>

          <button
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              background: "#dc2626",
              color: "white",
              borderRadius: 4,
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
