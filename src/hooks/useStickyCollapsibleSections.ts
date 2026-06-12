import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useScrollCollapseSections, type ScrollCollapseMeta} from './useScrollCollapseSections';

const DEFAULT_HEAD_HEIGHT = 36;
const STICKY_Z_BASE = 20;

export type StickyCollapsibleItemProps = {
  expanded: boolean;
  scrollPinned: boolean;
  stickyHead: boolean;
  stickyTop: number;
  stickyZIndex: number;
  sectionRef: (el: HTMLDivElement | null) => void;
  headRef: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
};

/**
 * 管理一组可折叠区块的展开状态，以及向下滚动时的标题行 sticky 堆叠冻结。
 *
 * 已冻结标题由 StickyCollapsiblePinnedStack 统一渲染在列表顶部，避免 per-section sticky 滚出视口。
 */
export function useStickyCollapsibleSections({
  count,
  defaultAllExpanded = false,
  resetScrollPinKey,
  autoExpandLastOnCountIncrease = false,
  scrollCollapseEnabled = true,
}: {
  count: number;
  defaultAllExpanded?: boolean;
  resetScrollPinKey?: unknown;
  autoExpandLastOnCountIncrease?: boolean;
  scrollCollapseEnabled?: boolean;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headHeightRef = useRef(DEFAULT_HEAD_HEIGHT);
  const expandedRef = useRef<Set<number>>(new Set());
  const scrollPinnedRef = useRef<Set<number>>(new Set());
  const [headHeight, setHeadHeight] = useState(DEFAULT_HEAD_HEIGHT);
  const prevCountRef = useRef(count);

  const [expanded, setExpanded] = useState<Set<number>>(() =>
    defaultAllExpanded ? new Set(Array.from({length: count}, (_, i) => i)) : new Set()
  );
  const [scrollPinned, setScrollPinned] = useState<Set<number>>(() => new Set());

  expandedRef.current = expanded;
  scrollPinnedRef.current = scrollPinned;

  const sortedPinnedIndices = useMemo(
    () => [...scrollPinned].sort((a, b) => a - b),
    [scrollPinned]
  );

  useEffect(() => {
    if (!autoExpandLastOnCountIncrease) {
      prevCountRef.current = count;
      return;
    }
    if (count > prevCountRef.current) {
      setExpanded((prev) => new Set([...prev, count - 1]));
    }
    prevCountRef.current = count;
  }, [count, autoExpandLastOnCountIncrease]);

  useEffect(() => {
    setScrollPinned(new Set());
  }, [resetScrollPinKey]);

  useLayoutEffect(() => {
    sectionRefs.current.length = count;
    headRefs.current.length = count;
    const headEl = headRefs.current.find(Boolean);
    if (!headEl) return;
    const measured = headEl.offsetHeight;
    if (measured > 0 && measured !== headHeightRef.current) {
      headHeightRef.current = measured;
      setHeadHeight(measured);
    }
  });

  const handleScrollCollapse = useCallback((index: number, _meta: ScrollCollapseMeta) => {
    if (!expandedRef.current.has(index)) return;
    setExpanded((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setScrollPinned((prev) => new Set([...prev, index]));
  }, []);

  useScrollCollapseSections({
    anchorRef: regionRef,
    sectionRefs,
    expandedRef,
    scrollPinnedRef,
    onCollapse: handleScrollCollapse,
    headHeightRef,
    enabled: scrollCollapseEnabled && count > 0,
  });

  const toggle = useCallback((index: number) => {
    setScrollPinned((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const expand = useCallback((index: number) => {
    setScrollPinned((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setExpanded((prev) => new Set([...prev, index]));
  }, []);

  const getItemProps = useCallback(
    (index: number): StickyCollapsibleItemProps => ({
      expanded: expanded.has(index),
      scrollPinned: scrollPinned.has(index),
      stickyHead: scrollCollapseEnabled && !scrollPinned.has(index),
      stickyTop: sortedPinnedIndices.length * headHeight,
      stickyZIndex: STICKY_Z_BASE,
      sectionRef: (el) => {
        sectionRefs.current[index] = el;
      },
      headRef: (el) => {
        headRefs.current[index] = el;
      },
      onToggle: () => toggle(index),
    }),
    [expanded, scrollPinned, sortedPinnedIndices.length, headHeight, toggle, scrollCollapseEnabled]
  );

  return {
    regionRef,
    expanded,
    scrollPinned,
    sortedPinnedIndices,
    headHeight,
    toggle,
    expand,
    isExpanded: (index: number) => expanded.has(index),
    isScrollPinned: (index: number) => scrollPinned.has(index),
    getItemProps,
  };
}
