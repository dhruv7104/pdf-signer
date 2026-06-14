"use client";

import React, {
  useState,
  useRef,
  useEffect,
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import SignaturePopup from "../components/SignaturePopup";

type Box = {
  id: number;
  fieldType: "signature" | "text" | "image" | "date" | "radio";
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
  signature?: string | null; // base64 image for signature/image
  value?: string;            // text/date value
};

const FIELD_LABELS: Record<Box["fieldType"], string> = {
  signature: "Signature",
  text: "Text",
  image: "Image",
  date: "Date",
  radio: "Radio",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontSize: "13px",
};

function PdfViewer() {
  const [pdfLink, setPdfLink] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeBoxId, setActiveBoxId] = useState<number | null>(null);

  const [originalHash, setOriginalHash] = useState<string | null>(null);
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);

  // Enhancement #18: loading state while signing
  const [isSigning, setIsSigning] = useState(false);

  const pdfAreaRef = useRef<HTMLDivElement | null>(null);
  const draggingBoxIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];

    if (!file) {
      setPdfLink(null);
      setPdfFile(null);
      setBoxes([]);
      return;
    }

    const url = URL.createObjectURL(file);
    setPdfLink(url);
    setPdfFile(file);
    setBoxes([]);
    setOriginalHash(null);
    setSignedHash(null);
    setPdfId(null);
  }

  function addFieldBox(fieldType: Box["fieldType"]) {
    if (!pdfLink) {
      alert("Please upload a PDF first.");
      return;
    }

    const base: Box = {
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

  // Enhancement #16: delete a box
  function deleteBox(id: number) {
    setBoxes((old) => old.filter((b) => b.id !== id));
  }

  function handleBoxMouseDown(
    e: ReactMouseEvent<HTMLDivElement>,
    id: number
  ) {
    e.preventDefault();
    if (!pdfAreaRef.current) return;

    const areaRect = pdfAreaRef.current.getBoundingClientRect();
    const currentBox = boxes.find((b) => b.id === id);
    if (!currentBox) return;

    const boxLeftPx = currentBox.xPercent * areaRect.width;
    const boxTopPx = currentBox.yPercent * areaRect.height;

    dragOffsetRef.current = {
      x: e.clientX - (areaRect.left + boxLeftPx),
      y: e.clientY - (areaRect.top + boxTopPx),
    };

    draggingBoxIdRef.current = id;
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const activeId = draggingBoxIdRef.current;
      if (activeId === null) return;
      if (!pdfAreaRef.current) return;

      const areaRect = pdfAreaRef.current.getBoundingClientRect();

      // Bug fix #2: find the box to get its width/height for correct clamping
      setBoxes((old) => {
        const box = old.find((b) => b.id === activeId);
        if (!box) return old;

        const boxWidthPx = box.wPercent * areaRect.width;
        const boxHeightPx = box.hPercent * areaRect.height;

        let newLeftPx = e.clientX - areaRect.left - dragOffsetRef.current.x;
        let newTopPx = e.clientY - areaRect.top - dragOffsetRef.current.y;

        // Clamp so the box never leaves the PDF area
        if (newLeftPx < 0) newLeftPx = 0;
        if (newTopPx < 0) newTopPx = 0;
        if (newLeftPx > areaRect.width - boxWidthPx)
          newLeftPx = areaRect.width - boxWidthPx;
        if (newTopPx > areaRect.height - boxHeightPx)
          newTopPx = areaRect.height - boxHeightPx;

        const newXPercent = newLeftPx / areaRect.width;
        const newYPercent = newTopPx / areaRect.height;

        return old.map((b) =>
          b.id === activeId
            ? { ...b, xPercent: newXPercent, yPercent: newYPercent }
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

  async function handleDownloadSigned() {
    if (!pdfFile) {
      alert("No PDF selected");
      return;
    }

    if (boxes.length === 0) {
      alert("Add at least one field on the PDF.");
      return;
    }

    const hasSignature = boxes.some(
      (b) => b.fieldType === "signature" && b.signature
    );
    if (!hasSignature) {
      alert("Please draw and save a signature field.");
      return;
    }

    const form = new FormData();
    form.append("pdf", pdfFile);

    const serializableBoxes = boxes.map((b) => ({
      fieldType: b.fieldType,
      xPercent: b.xPercent,
      yPercent: b.yPercent,
      wPercent: b.wPercent,
      hPercent: b.hPercent,
      signature: b.signature || null,
      value: b.value || "",
    }));

    form.append("boxes", JSON.stringify(serializableBoxes));

    setIsSigning(true);
    try {
      const res = await fetch("/api/sign-pdf", {
        method: "POST",
        body: form,
      });

      // Bug fix #1: only read and store hashes when the request succeeded
      if (!res.ok) {
        try {
          const data = await res.json();
          alert(`Failed to sign PDF: ${data.error || res.statusText}`);
        } catch {
          alert(`Failed to sign PDF: ${res.status}`);
        }
        return;
      }

      const original = res.headers.get("x-original-hash");
      const signed = res.headers.get("x-signed-hash");
      const id = res.headers.get("x-pdf-id");

      setOriginalHash(original);
      setSignedHash(signed);
      setPdfId(id);

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

      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input type="file" accept="application/pdf" onChange={handleFileChange} />

        <button onClick={() => addFieldBox("signature")} style={buttonStyle}>
          Signature Field
        </button>

        <button onClick={() => addFieldBox("text")} style={buttonStyle}>
          Text Field
        </button>

        <button onClick={() => addFieldBox("image")} style={buttonStyle}>
          Image Field
        </button>

        <button onClick={() => addFieldBox("date")} style={buttonStyle}>
          Date Field
        </button>

        <button onClick={() => addFieldBox("radio")} style={buttonStyle}>
          Radio Button
        </button>

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

      {(originalHash || signedHash || pdfId) && (
        <div
          style={{
            marginTop: "8px",
            padding: "12px",
            background: "#f3f4f6",
            borderRadius: "8px",
            maxWidth: "800px",
            width: "100%",
            fontSize: "12px",
            wordBreak: "break-all",
          }}
        >
          {originalHash && (
            <>
              <p>
                <strong>Original SHA-256:</strong>
              </p>
              <p>{originalHash}</p>
            </>
          )}

          {signedHash && (
            <>
              <p style={{ marginTop: "8px" }}>
                <strong>Signed SHA-256:</strong>
              </p>
              <p>{signedHash}</p>
            </>
          )}

          {pdfId && (
            <>
              <p style={{ marginTop: "8px" }}>
                <strong>PDF ID:</strong>
              </p>
              <p>{pdfId}</p>
            </>
          )}
        </div>
      )}

      {pdfLink && (
        <div
          style={{
            marginTop: "16px",
            border: "1px solid #ddd",
            padding: "8px",
            maxWidth: "800px",
            width: "100%",
          }}
        >
          <div
            ref={pdfAreaRef}
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "210 / 297",
              overflow: "hidden",
              background: "#f9fafb",
            }}
          >
            <iframe
              src={`${pdfLink}#toolbar=0&navpanes=0&scrollbar=0`}
              title="PDF Preview"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />

            {boxes.map((box) => (
              <div
                key={box.id}
                onMouseDown={(e) => handleBoxMouseDown(e, box.id)}
                onDoubleClick={() => {
                  if (box.fieldType === "signature") {
                    setActiveBoxId(box.id);
                  } else if (box.fieldType === "text") {
                    const val = prompt("Enter text:", box.value || "");
                    if (val !== null) {
                      setBoxes((old) =>
                        old.map((b) =>
                          b.id === box.id ? { ...b, value: val } : b
                        )
                      );
                    }
                  } else if (box.fieldType === "date") {
                    // Bug fix #9: validate date format before saving
                    const val = prompt(
                      "Enter date (YYYY-MM-DD):",
                      box.value || new Date().toISOString().split("T")[0]
                    );
                    if (val !== null) {
                      if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                        alert("Invalid date format. Please use YYYY-MM-DD.");
                        return;
                      }
                      setBoxes((old) =>
                        old.map((b) =>
                          b.id === box.id ? { ...b, value: val } : b
                        )
                      );
                    }
                  } else if (box.fieldType === "image") {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.style.display = "none";
                    // Bug fix #14: append to DOM before clicking (Safari/Firefox compat)
                    document.body.appendChild(input);
                    input.onchange = (event) => {
                      const target = event.target as HTMLInputElement;
                      const file = target.files && target.files[0];
                      document.body.removeChild(input);
                      if (!file) return;

                      const reader = new FileReader();
                      reader.onload = () => {
                        setBoxes((old) =>
                          old.map((b) =>
                            b.id === box.id
                              ? { ...b, signature: reader.result as string }
                              : b
                          )
                        );
                      };
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  } else if (box.fieldType === "radio") {
                    // Toggle radio value on double-click
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
                  background: "rgba(255,255,255,0.4)",
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
                {/* Enhancement #16: delete button on each box */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBox(box.id);
                  }}
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
                    fontSize: "10px",
                    lineHeight: "18px",
                    textAlign: "center",
                    padding: 0,
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>

                {box.fieldType === "signature" &&
                  (box.signature ? (
                    <img
                      src={box.signature}
                      alt="Signature"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    // Enhancement #17: field type label
                    <span style={{ color: "#6b7280", pointerEvents: "none" }}>
                      {FIELD_LABELS.signature}
                    </span>
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
                    <img
                      src={box.signature}
                      alt="Image"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <span style={{ color: "#6b7280", pointerEvents: "none" }}>
                      {FIELD_LABELS.image}
                    </span>
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
      )}

      {activeBoxId !== null && (
        <SignaturePopup
          onSave={(img: string) => {
            setBoxes((old) =>
              old.map((b) =>
                b.id === activeBoxId ? { ...b, signature: img } : b
              )
            );
            setActiveBoxId(null);
          }}
          onCancel={() => setActiveBoxId(null)}
        />
      )}
    </main>
  );
}

export default PdfViewer;
