import ReactMarkdown from "react-markdown";

export default function DocDisplay({ markdown, onCopy }) {
  return (
    <div className="doc-display">
      <div className="header">
        <h2>AI Generated Documentation</h2>
        <button onClick={onCopy} className="copy-btn">Copy</button>
      </div>
      <div className="content">
        {markdown ? (
          <ReactMarkdown>{markdown}</ReactMarkdown>
        ) : (
          <p className="empty">No documentation yet. Generate to see results.</p>
        )}
      </div>

      <style jsx>{`
        .doc-display {
          background: #111827;
          color: #f9fafb;
          padding: 1rem;
          flex: 1;
          border-left: 1px solid #374151;
          overflow-y: auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        h2 {
          font-size: 1.2rem;
          font-weight: bold;
        }
        .copy-btn {
          background: #2563eb;
          color: white;
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .copy-btn:hover {
          background: #1d4ed8;
        }
        .content {
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .empty {
          color: #6b7280;
        }
        code {
          background: #1f2937;
          padding: 2px 4px;
          border-radius: 4px;
          font-size: 0.85rem;
        }
        pre {
          background: #1f2937;
          padding: 0.75rem;
          border-radius: 6px;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
