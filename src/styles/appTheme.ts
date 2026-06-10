/**
 * 应用暗色主题 token — 背景色、文字色、弹窗等统一从此取值，避免局部漏设 color。
 */
import type React from 'react';

/** 详情/编辑弹窗最大宽度（与编辑页内容区一致） */
export const EDIT_MODAL_MAX_WIDTH = 720;

export const APP_COLORS = {
  bg: '#12121f',
  surface: '#1e1e32',
  surfaceRaised: '#252540',
  text: '#e8e8e8',
  textSecondary: '#d0d0d0',
  textMuted: '#a0a0b0',
  textDim: '#888',
  label: '#a78bfa',
  border: '#333',
  borderStrong: '#444',
  overlay: 'rgba(0, 0, 0, 0.6)',
  btnBg: '#2d2d44',
  btnDangerBg: '#3d2020',
  btnDangerBorder: '#6b3030',
  btnDangerText: '#f0a0a0',
} as const;

/** 编辑页主标题（h2） */
export const pageTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: 0,
  color: APP_COLORS.text,
};

/** 弹窗标题（h2） */
export const modalTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
  color: APP_COLORS.text,
};

/** 详情/确认弹窗共用样式 */
export const sharedModalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: APP_COLORS.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: APP_COLORS.surface,
    color: APP_COLORS.text,
    borderRadius: 12,
    padding: 24,
    maxWidth: EDIT_MODAL_MAX_WIDTH,
    width: '90%',
    border: `1px solid ${APP_COLORS.border}`,
  },
  panelScrollable: {
    maxHeight: '85vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: modalTitleStyle,
  titleWithGap: {...modalTitleStyle, margin: '0 0 12px'},
  message: {
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: APP_COLORS.textDim,
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  btn: {
    padding: '8px 16px',
    backgroundColor: APP_COLORS.btnBg,
    border: `1px solid ${APP_COLORS.borderStrong}`,
    borderRadius: 6,
    color: APP_COLORS.text,
    cursor: 'pointer',
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: APP_COLORS.btnDangerBg,
    borderColor: APP_COLORS.btnDangerBorder,
    color: APP_COLORS.btnDangerText,
  },
};
