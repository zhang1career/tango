import React, {useEffect, useRef} from 'react';
import type {JournalThemeGroup} from '@/utils/journal-display';

interface JournalModalProps {
  open: boolean;
  groups: JournalThemeGroup[];
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
  themeBlock: {marginBottom: 20},
  themeHead: {
    margin: '0 0 10px',
    fontSize: 14,
    fontWeight: 600,
    color: '#a78bfa',
    borderBottom: '1px solid #2f2f45',
    paddingBottom: 6,
  },
  themeDesc: {margin: '0 0 10px', fontSize: 12, color: '#888', lineHeight: 1.5},
  list: {display: 'flex', flexDirection: 'column', gap: 10},
  card: {
    borderRadius: 10,
    border: '1px solid #2f2f45',
    backgroundColor: '#252540',
    padding: '12px 14px',
  },
  cardTitle: {margin: 0, fontSize: 15, color: '#f3f3ff', fontWeight: 600},
  cardContent: {margin: '8px 0 0', fontSize: 14, color: '#d8d8eb', lineHeight: 1.6, whiteSpace: 'pre-wrap'},
  emptyHint: {fontSize: 14, color: '#888', margin: 0},
};

export function JournalModal({open, groups, onClose}: JournalModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

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
          <h2 style={styles.title}>心迹{total > 0 ? ` (${total})` : ''}</h2>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div style={styles.body}>
          {total === 0 ? (
            <p style={styles.emptyHint}>暂无心迹。完成关键抉择后，这里会记录你的心路历程。</p>
          ) : (
            groups.map(({theme, entries}) => (
              <section key={theme.id} style={styles.themeBlock}>
                <h3 style={styles.themeHead}>{theme.name}</h3>
                {theme.description ? (
                  <p style={styles.themeDesc}>{theme.description}</p>
                ) : null}
                <div style={styles.list}>
                  {entries.map((entry) => (
                    <article key={entry.id} style={styles.card}>
                      <h4 style={styles.cardTitle}>{entry.title}</h4>
                      <p style={styles.cardContent}>{entry.content}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
