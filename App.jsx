import { useState } from "react";
import { Document, Page } from "react-pdf";

function App() {
  const [file, setFile] = useState(null);

  return (
    <div style={{ padding: 20 }}>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      {file && (
        <Document file={file}>
          <Page pageNumber={1} />
        </Document>
      )}
    </div>
  );
}

export default App;
