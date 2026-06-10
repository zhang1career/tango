/**
 * 编辑页通用样式（规则、场景等）
 */
import type React from 'react';
import {APP_COLORS, EDIT_MODAL_MAX_WIDTH, pageTitleStyle} from './appTheme';
import {listBtnIcon} from './listStyles';

export {EDIT_MODAL_MAX_WIDTH};

export const editorStyles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 720, margin: '0 auto', padding: 20, color: APP_COLORS.text},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `1px solid ${APP_COLORS.border}`,
  },
  title: pageTitleStyle,
  btn: {
    padding: '8px 16px',
    backgroundColor: APP_COLORS.btnBg,
    border: `1px solid ${APP_COLORS.borderStrong}`,
    borderRadius: 6,
    color: APP_COLORS.text,
    cursor: 'pointer',
    fontSize: 14,
  },
  section: {marginBottom: 24},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: APP_COLORS.label},
  input: {
    width: '100%',
    padding: 10,
    backgroundColor: APP_COLORS.surfaceRaised,
    border: `1px solid ${APP_COLORS.border}`,
    borderRadius: 6,
    color: APP_COLORS.text,
    fontSize: 14,
  },
  textarea: {minHeight: 60, resize: 'vertical' as const, boxSizing: 'border-box'},
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
    padding: '12px 16px',
    backgroundColor: APP_COLORS.surfaceRaised,
  },
  row: {marginBottom: 12},
  btnIcon: listBtnIcon,
  readOnlyValue: {fontSize: 14, color: APP_COLORS.text, padding: '4px 0'},
};
