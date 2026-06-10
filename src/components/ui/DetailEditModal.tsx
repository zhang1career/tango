/**
 * 详情/编辑弹窗 - 共用一套内容，通过 editable 切换可编辑与否
 * 按键统一：保存、取消。按 Esc 等同于取消
 */

import React, {useEffect} from 'react';
import {sharedModalStyles as modalStyles} from '../../styles/appTheme';

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
      <div
        style={{...modalStyles.panel, ...modalStyles.panelScrollable}}
        onClick={(e) => e.stopPropagation()}
      >
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
