import React from 'react';
import {listGrids, listStyles} from '../../styles/listStyles';
import {
  ListDeleteButton,
  ListEditButton,
  ListOpsCell,
  ListTableHeader,
  ListTableRow,
} from './ListPrimitives';

type EntityFlatListExtraColumn = {
  label: string;
  getValue: (index: number) => string | undefined;
};

function gridForExtraColumns(count: number): React.CSSProperties {
  if (count === 0) return listGrids.nameOps;
  if (count === 1) return listGrids.nameExtraOps;
  if (count === 2) return listGrids.nameTwoExtraOps;
  return {gridTemplateColumns: `1fr ${'1fr '.repeat(count)}4.5rem`};
}

export function EntityFlatList({
  count,
  emptyHint,
  getKey,
  getPrimary,
  getMeta,
  extraColumnLabel,
  getExtra,
  extraColumns,
  onOpen,
  onEdit,
  onDelete,
}: {
  count: number;
  emptyHint?: string;
  getKey: (index: number) => string;
  getPrimary: (index: number) => string;
  getMeta?: (index: number) => string | undefined;
  /** @deprecated 使用 extraColumns */
  extraColumnLabel?: string;
  /** @deprecated 使用 extraColumns */
  getExtra?: (index: number) => string | undefined;
  extraColumns?: EntityFlatListExtraColumn[];
  onOpen: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  if (count === 0) {
    return emptyHint ? <p style={{color: '#888', fontSize: 12, margin: 0}}>{emptyHint}</p> : null;
  }

  const columns: EntityFlatListExtraColumn[] =
    extraColumns ??
    (extraColumnLabel && getExtra ? [{label: extraColumnLabel, getValue: getExtra}] : []);
  const grid = gridForExtraColumns(columns.length);

  return (
    <div>
      <ListTableHeader grid={grid}>
        <span>名称</span>
        {columns.map((col) => (
          <span key={col.label}>{col.label}</span>
        ))}
        <span style={listStyles.cellOps}>操作</span>
      </ListTableHeader>
      {Array.from({length: count}, (_, i) => (
        <ListTableRow key={getKey(i)} grid={grid}>
          <span style={listStyles.namePrimary} onClick={() => onOpen(i)} role="presentation">
            {getPrimary(i)}
            {getMeta?.(i) ? <span style={listStyles.nameMeta}>{getMeta(i)}</span> : null}
          </span>
          {columns.map((col) => {
            const value = col.getValue(i);
            return (
              <span key={col.label} style={listStyles.cellMuted} title={value}>
                {value || '—'}
              </span>
            );
          })}
          <ListOpsCell>
            <ListEditButton onClick={() => onEdit(i)} />
            <ListDeleteButton onClick={() => onDelete(i)} />
          </ListOpsCell>
        </ListTableRow>
      ))}
    </div>
  );
}
