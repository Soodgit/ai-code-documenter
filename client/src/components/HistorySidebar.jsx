export default function HistorySidebar({ items, activeId, onSelect, onDelete }) {
  return (
    <aside className="history">
      <h2>History</h2>
      {items.length === 0 && <p className="empty">No snippets yet.</p>}
      <ul>
        {items.map((s) => (
          <li
            key={s._id}
            className={`item ${activeId === s._id ? "active" : ""}`}
            onClick={() => onSelect(s._id)}
          >
            <div className="title">
              {s.language}: {s.code.slice(0, 30)}...
            </div>
            <div className="meta">{new Date(s.createdAt).toLocaleString()}</div>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s._id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <style jsx>{`
        .history {
          background: #111827;
          color: #f9fafb;
          padding: 1rem;
          width: 250px;
          border-right: 1px solid #374151;
          overflow-y: auto;
        }
        h2 {
          font-size: 1.2rem;
          margin-bottom: 1rem;
          font-weight: bold;
        }
        .empty {
          color: #6b7280;
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .item {
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          background: #1f2937;
          border-radius: 6px;
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
        }
        .item:hover {
          background: #374151;
        }
        .item.active {
          background: #2563eb;
        }
        .title {
          font-size: 0.9rem;
          font-weight: 500;
        }
        .meta {
          font-size: 0.75rem;
          color: #9ca3af;
        }
        .delete-btn {
          position: absolute;
          right: 8px;
          top: 8px;
          background: transparent;
          border: none;
          color: #f87171;
          font-size: 1rem;
          cursor: pointer;
        }
      `}</style>
    </aside>
  );
}
