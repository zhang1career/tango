/**
 * 背包弹窗 - v1 仅查看物品图文
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {GameItem} from '@/schema/game-item';
import {resolveMediaUrl} from '@/config';

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
    flexDirection: 'column',
    width: '90%',
    maxWidth: 480,
    maxHeight: '80vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  title: {fontSize: 16, fontWeight: 600, color: '#e8e8e8', margin: 0},
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
  },
  itemList: {listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8},
  itemButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e8e8e8',
    fontSize: 15,
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    objectFit: 'cover',
    flexShrink: 0,
    backgroundColor: '#1a1a2e',
  },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    flexShrink: 0,
    backgroundColor: '#2d2d44',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: '#6c5ce7',
  },
  itemName: {fontWeight: 500},
  backBtn: {
    padding: '6px 0',
    background: 'none',
    border: 'none',
    color: '#a78bfa',
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 12,
  },
  detailImage: {
    width: '100%',
    maxHeight: 240,
    objectFit: 'contain',
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#111',
  },
  detailName: {fontSize: 18, fontWeight: 600, color: '#e8e8e8', margin: '0 0 8px'},
  detailDesc: {fontSize: 15, lineHeight: 1.6, color: '#d4d4d4', margin: 0, whiteSpace: 'pre-wrap'},
  emptyHint: {fontSize: 14, color: '#888', margin: 0},
};

function resolveInventoryItem(itemId: string, catalog: GameItem[]): GameItem {
  return catalog.find((x) => x.id === itemId) ?? {id: itemId, name: itemId};
}

interface InventoryModalProps {
  open: boolean;
  inventoryIds: string[];
  catalog: GameItem[];
  gameId?: string;
  onActiveBackgroundMusicChange?: (bgm: string | undefined) => void;
  onClose: () => void;
}

export function InventoryModal({
  open,
  inventoryIds,
  catalog,
  gameId,
  onActiveBackgroundMusicChange,
  onClose,
}: InventoryModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, selectedId]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  const heldItems = inventoryIds.map((id) => resolveInventoryItem(id, catalog));
  const selected = selectedId ? resolveInventoryItem(selectedId, catalog) : null;
  const selectedImages = (selected?.images ?? []).map((u) => resolveMediaUrl(u, gameId)).filter(Boolean);

  useEffect(() => {
    if (!open) {
      onActiveBackgroundMusicChange?.(undefined);
      return;
    }
    onActiveBackgroundMusicChange?.(selected?.backgroundMusic);
  }, [open, selected?.backgroundMusic, onActiveBackgroundMusicChange]);

  return (
    <div ref={overlayRef} style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={styles.header}>
          <h2 style={styles.title}>{selected ? selected.name : '背包'}</h2>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div style={styles.body}>
          {selected ? (
            <>
              <button type="button" style={styles.backBtn} onClick={() => setSelectedId(null)}>
                ← 返回列表
              </button>
              {selectedImages.length > 0 ? (
                <img src={selectedImages[0]} alt="" style={styles.detailImage} />
              ) : null}
              <h3 style={styles.detailName}>{selected.name}</h3>
              {selected.description ? (
                <p style={styles.detailDesc}>{selected.description}</p>
              ) : (
                !selectedImages.length && (
                  <p style={styles.emptyHint}>暂无图文描述。</p>
                )
              )}
            </>
          ) : heldItems.length === 0 ? (
            <p style={styles.emptyHint}>背包为空。</p>
          ) : (
            <ul style={styles.itemList}>
              {heldItems.map((item) => {
                const thumb = item.images?.[0]
                  ? resolveMediaUrl(item.images[0], gameId)
                  : undefined;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      style={styles.itemButton}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" style={styles.thumb} />
                      ) : (
                        <span style={styles.thumbPlaceholder}>◆</span>
                      )}
                      <span style={styles.itemName}>{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** 将 inventory id 列表解析为展示名称 */
export function resolveInventoryNames(inventoryIds: string[], catalog: GameItem[]): string[] {
  return inventoryIds.map((id) => catalog.find((x) => x.id === id)?.name ?? id);
}
