/**
 * 详情/编辑弹窗 - 共用一套内容，通过 editable 切换可编辑与否
 * 按键统一：保存、取消。按 Esc 等同于取消
 */

import React, { useEffect } from 'react';

const modalStyles: Record<string, React.CSSProperties> = {
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
    padding: 24,
    maxWidth: 520,
    width: '90%',
    maxHeight: '85vh',
    overflow: 'auto',
    border: '1px solid #333',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 600, margin: 0 },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  actions: { display: 'flex', gap: 10, marginTop: 16 },
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
};

export function DetailEditModal({
  title,
  open,
  onClose,
  editable,
  onSave,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  editable: boolean;
  onSave?: () => void | Promise<void>;
  children: React.ReactNode;
}) {
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
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>{title}</h2>
          <button type="button" style={modalStyles.closeBtn} onClick={onClose} title="关闭">
            ×
          </button>
        </div>
        {children}
        <div style={modalStyles.actions}>
          {editable && onSave && (
            <button
              type="button"
              style={modalStyles.btn}
              onClick={async () => {
                await onSave();
              }}
            >
              保存
            </button>
          )}
          <button type="button" style={modalStyles.btn} onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
