/**
 * 平铺列表与列表操作按钮的统一样式
 */
import type {CSSProperties} from 'react';

export const listBtnIcon: CSSProperties = {
  padding: '2px 8px',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 16,
};

export const listStyles = {
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  header: {
    display: 'grid',
    gap: 8,
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #444',
    color: '#9ca3af',
    fontSize: 12,
  },
  row: {
    display: 'grid',
    gap: 8,
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #333',
    fontSize: 12,
  },
  cellOps: {justifySelf: 'end'} as CSSProperties,
  opsGroup: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    justifySelf: 'end',
  },
  namePrimary: {fontWeight: 600, cursor: 'pointer'},
  nameMeta: {marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400},
};

export const listGrids = {
  nameOps: {gridTemplateColumns: '1fr 4.5rem'},
  scenePool: {gridTemplateColumns: '1fr 7rem 4.5rem'},
  transition: {gridTemplateColumns: '1fr 1fr 1fr 4.5rem'},
  binding: {gridTemplateColumns: '9rem 11rem 1fr 4.5rem'},
  fieldOps: {gridTemplateColumns: '1fr 4.5rem'},
} as const;
