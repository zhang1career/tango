import React from 'react';
import {listGrids, listStyles} from '../../styles/listStyles';
import {
  ListDeleteButton,
  ListEditButton,
  ListOpsCell,
  ListTableHeader,
  ListTableRow,
} from './ListPrimitives';

export function EntityFlatList({
  count,
  emptyHint,
  getKey,
  getPrimary,
  getMeta,
  extraColumnLabel,
  getExtra,
  onOpen,
  onEdit,
  onDelete,
}: {
  count: number;
  emptyHint?: string;
  getKey: (index: number) => string;
  getPrimary: (index: number) => string;
  getMeta?: (index: number) => string | undefined;
  extraColumnLabel?: string;
  getExtra?: (index: number) => string | undefined;
  onOpen: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  if (count === 0) {
    return emptyHint ? <p style={{color: '#888', fontSize: 14, margin: 0}}>{emptyHint}</p> : null;
  }

  const grid = extraColumnLabel ? listGrids.nameExtraOps : listGrids.nameOps;

  return (
    <div>
      <ListTableHeader grid={grid}>
        <span>名称</span>
        {extraColumnLabel ? <span>{extraColumnLabel}</span> : null}
        <span style={listStyles.cellOps}>操作</span>
      </ListTableHeader>
      {Array.from({length: count}, (_, i) => (
        <ListTableRow key={getKey(i)} grid={grid}>
          <span style={listStyles.namePrimary} onClick={() => onOpen(i)} role="presentation">
            {getPrimary(i)}
            {getMeta?.(i) ? <span style={listStyles.nameMeta}>{getMeta(i)}</span> : null}
          </span>
          {getExtra ? (
            <span style={listStyles.cellMuted} title={getExtra(i)}>
              {getExtra(i) || '—'}
            </span>
          ) : null}
          <ListOpsCell>
            <ListEditButton onClick={() => onEdit(i)} />
            <ListDeleteButton onClick={() => onDelete(i)} />
          </ListOpsCell>
        </ListTableRow>
      ))}
    </div>
  );
}
