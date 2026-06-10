/**
 * 确认弹窗（删除等破坏性操作）
 */

import React, {useEffect} from 'react';
import {sharedModalStyles as styles} from '../../styles/appTheme';

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
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.titleWithGap}>{title}</h2>
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
