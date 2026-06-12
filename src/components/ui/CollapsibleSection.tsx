import React from 'react';
import {ListOpsCell} from './ListPrimitives';
import {APP_COLORS} from '../../styles/appTheme';

export const collapsibleSectionStyles: Record<string, React.CSSProperties> = {
  section: {marginBottom: 12, padding: 10, border: '1px solid #444', borderRadius: 6},
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 12,
    color: '#9ca3af',
    userSelect: 'none',
  },
  title: {flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
  body: {paddingTop: 8},
};

export function CollapsibleSectionHead({
  title,
  showExpanded,
  onToggle,
  headActions,
  headRef,
  style,
}: {
  title: React.ReactNode;
  showExpanded: boolean;
  onToggle: () => void;
  headActions?: React.ReactNode;
  headRef?: React.Ref<HTMLDivElement>;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={headRef}
      style={{...collapsibleSectionStyles.head, ...style}}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span style={{display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0}}>
        <span style={{flexShrink: 0}}>{showExpanded ? '▼' : '▶'}</span>
        <span style={collapsibleSectionStyles.title}>{title}</span>
      </span>
      {headActions ? (
        <ListOpsCell>
          <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
            {headActions}
          </span>
        </ListOpsCell>
      ) : null}
    </div>
  );
}

/** 滚动冻结后、标题已移入 StickyCollapsiblePinnedStack 时的占位 */
export function CollapsibleSectionPinnedPlaceholder({
  sectionRef,
}: {
  sectionRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={sectionRef}
      aria-hidden
      style={{height: 0, overflow: 'hidden', margin: 0, padding: 0, border: 'none'}}
    />
  );
}

export function StickyCollapsiblePinnedStack({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: APP_COLORS.surface,
        borderBottom: `1px solid ${APP_COLORS.borderStrong}`,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

export function CollapsibleSection({
  title,
  expanded,
  onToggle,
  headActions,
  children,
  sectionRef,
  headRef,
  scrollPinned,
  stickyHead,
  stickyTop = 0,
  stickyZIndex = 1,
}: {
  title: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  headActions?: React.ReactNode;
  children: React.ReactNode;
  sectionRef?: React.Ref<HTMLDivElement>;
  headRef?: React.Ref<HTMLDivElement>;
  scrollPinned?: boolean;
  stickyHead?: boolean;
  stickyTop?: number;
  stickyZIndex?: number;
}) {
  if (scrollPinned) {
    return <CollapsibleSectionPinnedPlaceholder sectionRef={sectionRef} />;
  }

  const showBody = expanded;
  const headSticky = Boolean(stickyHead);

  return (
    <div ref={sectionRef} style={collapsibleSectionStyles.section}>
      <CollapsibleSectionHead
        headRef={headRef}
        title={title}
        showExpanded={showBody}
        onToggle={onToggle}
        headActions={headActions}
        style={
          headSticky
            ? {
                position: 'sticky',
                top: stickyTop,
                zIndex: stickyZIndex,
                backgroundColor: APP_COLORS.surface,
              }
            : undefined
        }
      />
      {showBody && <div style={collapsibleSectionStyles.body}>{children}</div>}
    </div>
  );
}
