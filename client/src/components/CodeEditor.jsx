export default function CodeEditor({ language, code, onChange }) {
  return (
    <div className="code-editor">
      <div className="header">
        <span className="lang">{language}</span>
      </div>
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        spellCheck="false"
      />
      <style jsx>{`
        .code-editor {
          background: #111827;
          color: #f9fafb;
          border: 1px solid #374151;
          border-radius: 8px;
          flex: 2;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .header {
          background: #1f2937;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          font-weight: 600;
          border-bottom: 1px solid #374151;
        }
        textarea {
          flex: 1;
          background: #111827;
          border: none;
          outline: none;
          color: #f9fafb;
          font-family: "Fira Code", monospace;
          font-size: 0.95rem;
          padding: 1rem;
          resize: none;
          line-height: 1.5;
        }
        textarea::-webkit-scrollbar {
          width: 6px;
        }
        textarea::-webkit-scrollbar-thumb {
          background: #374151;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
}
