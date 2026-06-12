import React, {useState} from 'react';
import {listBtnIcon, listStyles} from '../../styles/listStyles';
import {ConfirmModal} from './ConfirmModal';

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

function listIconBtnStyle(disabled?: boolean): React.CSSProperties {
  return {
    ...listBtnIcon,
    display: 'flex',
    alignItems: 'center',
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function PlantIcon({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <path d="M12 22v-8" />
      <path d="M8 14h8" />
      <path d="M12 6V2" />
      <path d="M7 6c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </svg>
  );
}

function ClearIcon({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <path d="M12 3v9" />
      <path d="M7 12h10" />
      <path d="M5 12l2 9" />
      <path d="M9 12l1 9" />
      <path d="M14 12l-1 9" />
      <path d="M19 12l-2 9" />
      <path d="M3 21h18" />
    </svg>
  );
}

function DeleteIcon({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

export function ListPlantButton({
  title = '埋设',
  disabled,
  stopPropagation,
  onClick,
}: {
  title?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={listIconBtnStyle(disabled)}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (disabled) return;
        onClick();
      }}
    >
      <PlantIcon />
    </button>
  );
}

export function ListClearButton({
  title = '清除',
  confirmMessage,
  confirmTitle = '确认清除',
  disabled,
  stopPropagation,
  onClick,
}: {
  title?: string;
  confirmMessage?: string;
  confirmTitle?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  onClick: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const message = confirmMessage ?? `确认${title}？`;

  return (
    <>
      <button
        type="button"
        style={listIconBtnStyle(disabled)}
        title={title}
        disabled={disabled}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          if (disabled) return;
          setConfirmOpen(true);
        }}
      >
        <ClearIcon />
      </button>
      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        message={message}
        confirmLabel="清除"
        onConfirm={onClick}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function ListDeleteButton({
  title = '删除',
  confirmMessage,
  confirmTitle = '确认删除',
  disabled,
  stopPropagation,
  onClick,
}: {
  title?: string;
  confirmMessage?: string;
  confirmTitle?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  onClick: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const message = confirmMessage ?? `确认${title}？`;

  return (
    <>
      <button
        type="button"
        style={listIconBtnStyle(disabled)}
        title={title}
        disabled={disabled}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          if (disabled) return;
          setConfirmOpen(true);
        }}
      >
        <DeleteIcon />
      </button>
      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        message={message}
        confirmLabel="删除"
        onConfirm={onClick}
        onClose={() => setConfirmOpen(false)}
      />
    </>
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
