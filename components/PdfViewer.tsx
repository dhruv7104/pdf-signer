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

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
};

function PdfViewer() {
  const [pdfLink, setPdfLink] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeBoxId, setActiveBoxId] = useState<number | null>(null);

  const [originalHash, setOriginalHash] = useState<string | null>(null);
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);

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

  function handleAddSignatureBox() {
    addFieldBox("signature");
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

      let newLeftPx = e.clientX - areaRect.left - dragOffsetRef.current.x;
      let newTopPx = e.clientY - areaRect.top - dragOffsetRef.current.y;

      if (newLeftPx < 0) newLeftPx = 0;
      if (newTopPx < 0) newTopPx = 0;
      if (newLeftPx > areaRect.width) newLeftPx = areaRect.width;
      if (newTopPx > areaRect.height) newTopPx = areaRect.height;

      const newXPercent = newLeftPx / areaRect.width;
      const newYPercent = newTopPx / areaRect.height;

      setBoxes((old) =>
        old.map((b) =>
          b.id === activeId
            ? { ...b, xPercent: newXPercent, yPercent: newYPercent }
            : b
        )
      );
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

    try {
      const res = await fetch("/api/sign-pdf", {
        method: "POST",
        body: form,
      });

      const original = res.headers.get("x-original-hash");
      const signed = res.headers.get("x-signed-hash");
      const id = res.headers.get("x-pdf-id");

      setOriginalHash(original);
      setSignedHash(signed);
      setPdfId(id);

      if (!res.ok) {
        try {
          const data = await res.json();
          alert(`Failed to sign pdf: ${data.error || res.statusText}`);
        } catch {
          alert(`Failed to sign pdf: ${res.status}`);
        }
        return;
      }

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

        <button onClick={handleAddSignatureBox} style={buttonStyle}>
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
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            background: "#16a34a",
            color: "white",
            cursor: "pointer",
          }}
        >
          Download Signed PDF
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
              title="PDF"
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
                    const val = prompt(
                      "Enter date (YYYY-MM-DD):",
                      box.value || ""
                    );
                    if (val !== null) {
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
                    input.onchange = (event) => {
                      const target = event.target as HTMLInputElement;
                      const file = target.files && target.files[0];
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
                    alert("Radio field clicked");
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
                }}
              >
                {box.fieldType === "signature" &&
                  (box.signature ? (
                    <img
                      src={box.signature}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    "Signature"
                  ))}

                {box.fieldType === "text" && (
                  <span>{box.value || "Text"}</span>
                )}

                {box.fieldType === "date" && (
                  <span>{box.value || "Date"}</span>
                )}

                {box.fieldType === "image" &&
                  (box.signature ? (
                    <img
                      src={box.signature}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    "Image"
                  ))}

                {box.fieldType === "radio" && (
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      border: "2px solid #000",
                    }}
                  ></div>
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
