import React from 'react';
import {listBtnIcon, listStyles} from '../../styles/listStyles';

export function ListAddButton({
  title,
  disabled,
  onClick,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" style={listBtnIcon} title={title} disabled={disabled} onClick={onClick}>
      +
    </button>
  );
}

export function ListDeleteButton({
  title = '删除',
  disabled,
  onClick,
}: {
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" style={listBtnIcon} title={title} disabled={disabled} onClick={onClick}>
      ×
    </button>
  );
}

export function ListEditButton({title = '编辑', onClick}: {title?: string; onClick: () => void}) {
  return (
    <button type="button" style={listBtnIcon} title={title} onClick={onClick}>
      ✎
    </button>
  );
}

export function ListSectionHead({
  title,
  titleStyle,
  addTitle,
  onAdd,
  addDisabled,
  trailing,
}: {
  title: React.ReactNode;
  titleStyle?: React.CSSProperties;
  addTitle?: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div style={listStyles.sectionHead}>
      {typeof title === 'string' ? <span style={titleStyle}>{title}</span> : title}
      {onAdd ? (
        <ListAddButton title={addTitle ?? '添加'} disabled={addDisabled} onClick={onAdd} />
      ) : (
        trailing
      )}
    </div>
  );
}

export function ListTableHeader({
  grid,
  children,
}: {
  grid: React.CSSProperties;
  children: React.ReactNode;
}) {
  return <div style={{...listStyles.header, ...grid}}>{children}</div>;
}

export function ListTableRow({
  grid,
  children,
}: {
  grid: React.CSSProperties;
  children: React.ReactNode;
}) {
  return <div style={{...listStyles.row, ...grid}}>{children}</div>;
}

export function ListOpsCell({children}: {children: React.ReactNode}) {
  return <div style={listStyles.opsGroup}>{children}</div>;
}
