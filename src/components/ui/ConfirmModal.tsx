/**
 * 确认弹窗（删除等破坏性操作）
 */

import React, {useEffect} from 'react';
import {EDIT_MODAL_MAX_WIDTH} from '../../styles/editorStyles';

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
    padding: 24,
    maxWidth: EDIT_MODAL_MAX_WIDTH,
    width: '90%',
    border: '1px solid #333',
  },
  title: {fontSize: 18, fontWeight: 600, margin: '0 0 12px'},
  message: {fontSize: 14, color: '#d0d0d0', margin: 0, lineHeight: 1.5},
  actions: {display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end'},
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: '#3d2020',
    borderColor: '#6b3030',
    color: '#f0a0a0',
  },
};

export function ConfirmModal({
  open,
  title = '确认',
  message,
  confirmLabel = '删除',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{title}</h2>
        <div style={styles.message}>{message}</div>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            style={{...styles.btn, ...styles.btnDanger}}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
