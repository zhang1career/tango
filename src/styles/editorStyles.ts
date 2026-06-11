/**
 * 编辑页通用样式（与「剧情」「章节」页表单字号一致）
 */
import type React from 'react';
import {APP_COLORS, EDIT_MODAL_MAX_WIDTH, pageTitleStyle} from './appTheme';
import {listBtnIcon} from './listStyles';

export {EDIT_MODAL_MAX_WIDTH};

/** 区块小标题（与章节页 sectionTitle 一致） */
export const sectionTitleStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  color: '#d1d5db',
  marginBottom: 8,
};

export const editorStyles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 720, margin: '0 auto', padding: 20, color: APP_COLORS.text},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: `1px solid ${APP_COLORS.border}`,
  },
  title: pageTitleStyle,
  btn: {
    padding: '6px 14px',
    backgroundColor: APP_COLORS.btnBg,
    border: `1px solid ${APP_COLORS.borderStrong}`,
    borderRadius: 6,
    color: APP_COLORS.text,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnSmall: {
    padding: '4px 10px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12,
  },
  section: {marginBottom: 24},
  sectionTitle: sectionTitleStyle,
  label: {display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af'},
  input: {
    width: '100%',
    padding: '6px 10px',
    backgroundColor: '#1a1a2e',
    border: `1px solid ${APP_COLORS.borderStrong}`,
    borderRadius: 4,
    color: APP_COLORS.text,
    fontSize: 13,
    boxSizing: 'border-box',
  },
  textarea: {
    minHeight: 60,
    resize: 'vertical' as const,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    lineHeight: 1.55,
  },
  hint: {fontSize: 12, color: '#888', marginBottom: 12},
  card: {
    marginBottom: 12,
    backgroundColor: APP_COLORS.surface,
    color: APP_COLORS.text,
    borderRadius: 8,
    overflow: 'hidden',
    border: `1px solid ${APP_COLORS.border}`,
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: APP_COLORS.surfaceRaised,
  },
  row: {marginBottom: 12},
  btnIcon: listBtnIcon,
  readOnlyValue: {fontSize: 13, color: APP_COLORS.text, padding: '4px 0'},
};
