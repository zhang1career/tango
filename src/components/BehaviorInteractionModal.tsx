/**
 * 行为交互弹窗 - 左侧头像，右侧历史+行为选项
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {GameBehavior} from '@/schema/game-behavior';
import type {GameCharacter} from '@/schema/game-character';
import type {BehaviorInteractionContext} from '@/engine';
import {getAvailableBehaviors} from '@/engine';
import {resolveMediaUrl, getBehaviorHistoryInitialCount, getBehaviorHistoryPageSize} from '@/config';

export interface BehaviorHistoryEntry {
  charId: string;
  behaviorId: string;
  q: string;
  response: string;
  seq: number;
}


const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    border: '1px solid #333',
    display: 'flex',
    flexDirection: 'row',
    width: '90%',
    maxWidth: 640,
    height: '80vh',
    maxHeight: '80vh',
    overflow: 'hidden',
  },
  left: {
    width: 100,
    minWidth: 100,
    padding: 16,
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  charName: {fontSize: 14, color: '#e8e8e8', marginTop: 8, textAlign: 'center'},
  right: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  historyScroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  historyItem: {
    padding: 12,
    backgroundColor: '#252540',
    borderRadius: 8,
    borderLeft: '4px solid #6c5ce7',
  },
  historyQ: {fontSize: 14, color: '#a78bfa', marginBottom: 6},
  historyA: {fontSize: 15, color: '#d4d4d4', lineHeight: 1.5},
  optionsArea: {
    padding: 16,
    borderTop: '1px solid #333',
    maxHeight: 200,
    overflow: 'auto',
  },
  behaviorList: {listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8},
  behaviorButton: {
    padding: '10px 14px',
    backgroundColor: '#252540',
    border: 'none',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 15,
    textAlign: 'left',
    cursor: 'pointer',
    borderLeft: '3px solid #6c5ce7',
  },
  emptyHint: {fontSize: 14, color: '#888', margin: 0},
};

interface BehaviorInteractionModalProps {
  open: boolean;
  character: GameCharacter | null;
  characters: GameCharacter[];
  behaviorCtx: BehaviorInteractionContext | null;
  history: BehaviorHistoryEntry[];
  onExecute: (charId: string, b: GameBehavior) => void;
  onClose: () => void;
}

export function BehaviorInteractionModal({
  open,
  character,
  characters,
  behaviorCtx,
  history,
  onExecute,
  onClose,
}: BehaviorInteractionModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const optionsAreaRef = useRef<HTMLDivElement>(null);
  const initialCount = getBehaviorHistoryInitialCount();
  const pageSize = getBehaviorHistoryPageSize();
  const [displayedCount, setDisplayedCount] = useState(initialCount);
  const prevHistoryLenRef = useRef(0);

  const charHistory = character
    ? history.filter((h) => h.charId === character.id).sort((a, b) => a.seq - b.seq)
    : [];
  const visibleHistory = charHistory.slice(-displayedCount);
  const hasMore = displayedCount < charHistory.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setDisplayedCount((c) => Math.min(c + pageSize, charHistory.length));
  }, [hasMore, charHistory.length, pageSize]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'PageUp' || e.key === 'ArrowUp') {
        loadMore();
      }
      if (e.key === 'PageDown' || e.key === 'ArrowDown') {
        const el = scrollRef.current;
        if (el) el.scrollTop = Math.min(el.scrollTop + el.clientHeight, el.scrollHeight - el.clientHeight);
      }
      if (e.key === ' ') {
        const el = scrollRef.current;
        if (el) el.scrollTop = Math.min(el.scrollTop + el.clientHeight, el.scrollHeight - el.clientHeight);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, loadMore]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const prevLen = prevHistoryLenRef.current;
    prevHistoryLenRef.current = charHistory.length;
    if (charHistory.length > prevLen) {
      setDisplayedCount((c) => Math.max(c, charHistory.length));
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [open, charHistory.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop < 80) {
      loadMore();
    }
  }, [hasMore, loadMore]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const historyEl = scrollRef.current;
    const optionsEl = optionsAreaRef.current;
    if (!open || !overlay) return;

    const handleWheel = (e: WheelEvent) => {
      if (!overlay.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as Node;
      if (historyEl?.contains(target)) {
        if (e.deltaY < 0) {
          if (historyEl.scrollTop < 80 && displayedCount < charHistory.length) {
            setDisplayedCount((c) => Math.min(c + pageSize, charHistory.length));
          } else {
            historyEl.scrollTop = Math.max(0, historyEl.scrollTop + e.deltaY);
          }
        } else {
          historyEl.scrollTop = Math.min(
            historyEl.scrollHeight - historyEl.clientHeight,
            historyEl.scrollTop + e.deltaY
          );
        }
      } else if (optionsEl?.contains(target)) {
        optionsEl.scrollTop = Math.max(
          0,
          Math.min(optionsEl.scrollHeight - optionsEl.clientHeight, optionsEl.scrollTop + e.deltaY)
        );
      }
    };

    overlay.addEventListener('wheel', handleWheel, {passive: false});
    return () => overlay.removeEventListener('wheel', handleWheel);
  }, [open, displayedCount, charHistory.length, pageSize]);

  useEffect(() => {
    if (open && character) {
      const len = history.filter((h) => h.charId === character.id).length;
      setDisplayedCount(Math.min(initialCount, len));
      prevHistoryLenRef.current = len;
    }
  }, [open, character?.id, initialCount]); // 仅在弹窗打开或切换角色时重置，不要在 history 变化时重置

  if (!open) return null;

  const behaviorList =
    character && behaviorCtx ? getAvailableBehaviors(character.id, behaviorCtx) : [];
  const avatarUrl = character?.avatar ? resolveMediaUrl(character.avatar) : undefined;

  return (
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.left}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={styles.avatar} />
          ) : (
            <div
              style={{
                ...styles.avatar,
                backgroundColor: '#333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{color: '#666', fontSize: 24}}>?</span>
            </div>
          )}
          <span style={styles.charName}>{character?.name ?? ''}</span>
        </div>

        <div style={styles.right}>
          <div style={styles.header}>
            <span style={{fontSize: 16, fontWeight: 600, color: '#e8e8e8'}}>对话</span>
            <button type="button" style={styles.closeBtn} onClick={onClose} title="关闭">
              ×
            </button>
          </div>

          <div
            ref={scrollRef}
            style={styles.historyScroll}
            onScroll={handleScroll}
          >
            {visibleHistory.map((h) => (
              <div key={h.seq} style={styles.historyItem}>
                <div style={styles.historyQ}>{h.q}</div>
                <div style={styles.historyA}>{h.response}</div>
              </div>
            ))}
          </div>

          <div ref={optionsAreaRef} style={styles.optionsArea}>
            {behaviorList.length > 0 ? (
              <ul style={styles.behaviorList}>
                {behaviorList.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      style={styles.behaviorButton}
                      onClick={() => character && onExecute(character.id, b)}
                    >
                      {b.t === 'action' ? `(${b.q})` : b.q}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={styles.emptyHint}>暂无可用行为</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
