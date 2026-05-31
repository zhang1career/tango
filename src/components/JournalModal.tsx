import React, {useEffect, useRef} from 'react';
import type {JournalEntry} from '@/types';

interface JournalModalProps {
  open: boolean;
  entries: JournalEntry[];
  onClose: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    border: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    width: '92%',
    maxWidth: 560,
    maxHeight: '80vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  title: {fontSize: 16, fontWeight: 600, color: '#e8e8e8', margin: 0},
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
  },
  list: {display: 'flex', flexDirection: 'column', gap: 10},
  card: {
    borderRadius: 10,
    border: '1px solid #2f2f45',
    backgroundColor: '#252540',
    padding: '12px 14px',
  },
  cardTitle: {margin: 0, fontSize: 15, color: '#f3f3ff', fontWeight: 600},
  cardMeta: {margin: '6px 0 0', fontSize: 12, color: '#a9a9c7'},
  cardContent: {margin: '8px 0 0', fontSize: 14, color: '#d8d8eb', lineHeight: 1.6, whiteSpace: 'pre-wrap'},
  emptyHint: {fontSize: 14, color: '#888', margin: 0},
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function JournalModal({open, entries, onClose}: JournalModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={styles.header}>
          <h2 style={styles.title}>心迹</h2>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div style={styles.body}>
          {sorted.length === 0 ? (
            <p style={styles.emptyHint}>暂无心迹。完成关键抉择后，这里会记录你的心路历程。</p>
          ) : (
            <div style={styles.list}>
              {sorted.map((entry) => (
                <article key={`${entry.id}-${entry.createdAt}`} style={styles.card}>
                  <h3 style={styles.cardTitle}>{entry.title}</h3>
                  <p style={styles.cardMeta}>{formatTime(entry.createdAt)}</p>
                  <p style={styles.cardContent}>{entry.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
