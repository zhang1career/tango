import {useEffect, type RefObject} from 'react';

export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const {overflowY} = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

function blockTopInScrollContent(blockEl: HTMLElement, scrollEl: HTMLElement): number {
  const scrollRect = scrollEl.getBoundingClientRect();
  const blockRect = blockEl.getBoundingClientRect();
  return blockRect.top - scrollRect.top + scrollEl.scrollTop;
}

function blockBottomInScrollContent(blockEl: HTMLElement, scrollEl: HTMLElement): number {
  return blockTopInScrollContent(blockEl, scrollEl) + blockEl.offsetHeight;
}

export type ScrollCollapseMeta = Record<string, never>;

/**
 * 向下滚动时，当当前第一个展开区块的正文滚过顶部冻结区则触发 onCollapse（每次最多一个）。
 * 通常通过 useStickyCollapsibleSections 间接使用。
 */
export function useScrollCollapseSections({
  anchorRef,
  sectionRefs,
  expandedRef,
  scrollPinnedRef,
  onCollapse,
  headHeightRef,
  enabled = true,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  sectionRefs: RefObject<(HTMLElement | null)[]>;
  expandedRef: RefObject<Set<number>>;
  scrollPinnedRef: RefObject<Set<number>>;
  onCollapse: (index: number, meta: ScrollCollapseMeta) => void;
  headHeightRef: RefObject<number | null>;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const scrollEl = getScrollParent(anchor);
    if (!scrollEl) return;

    let raf = 0;
    const run = () => {
      const headHeight = headHeightRef.current ?? 0;
      if (headHeight <= 0) return;
      const refs = sectionRefs.current;
      if (!refs?.length) return;

      const expanded = expandedRef.current ?? new Set();
      const scrollPinned = scrollPinnedRef.current ?? new Set();
      const scrollTop = scrollEl.scrollTop;

      for (let i = 0; i < refs.length; i++) {
        if (!expanded.has(i)) continue;
        const el = refs[i];
        if (!el) continue;

        let pinnedBefore = 0;
        for (const j of scrollPinned) {
          if (j < i) pinnedBefore++;
        }

        const stickyStackBottom = scrollTop + (pinnedBefore + 1) * headHeight;
        const bottom = blockBottomInScrollContent(el, scrollEl);

        if (bottom <= stickyStackBottom + 1) {
          onCollapse(i, {});
        }
        break;
      }
    };

    const handleScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };

    scrollEl.addEventListener('scroll', handleScroll, {passive: true});
    handleScroll();
    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(raf);
    };
  }, [anchorRef, sectionRefs, expandedRef, scrollPinnedRef, onCollapse, headHeightRef, enabled]);
}
