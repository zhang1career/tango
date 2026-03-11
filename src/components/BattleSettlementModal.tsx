/**
 * 战斗结算弹窗
 * 展示结算信息，用户关闭后完成整个战斗流程
 */

import React, {useCallback, useEffect} from 'react';
import type {BattleResult} from './BattleModal';

interface BattleSettlementModalProps {
  open: boolean;
  result: BattleResult | null;
  playerName: string;
  enemyName: string;
  onClose: () => void;
}

export function BattleSettlementModal({
  open,
  result,
  playerName,
  enemyName,
  onClose,
}: BattleSettlementModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    },
    [onClose]
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>战斗结算</span>
          <button type="button" style={styles.closeBtn} onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        {result && (
          <div style={styles.content}>
            <div style={styles.resultLine}>
              {result.won ? (
                <span style={styles.win}>胜利！{playerName} 击败了 {enemyName}</span>
              ) : (
                <span style={styles.lose}>失败！{playerName} 被 {enemyName} 击败</span>
              )}
            </div>
            <div style={styles.stats}>
              <div>回合数：{result.rounds}</div>
              <div>造成伤害：{result.damageDealt}</div>
              <div>受到伤害：{result.damageTaken}</div>
            </div>
          </div>
        )}

        <div style={styles.footer}>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
  },
  modal: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    border: '1px solid #333',
    width: '90%',
    maxWidth: 400,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #333',
  },
  title: {fontSize: 18, fontWeight: 600, color: '#e8e8e8'},
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  content: {padding: 20},
  resultLine: {fontSize: 16, marginBottom: 16},
  win: {color: '#6c5ce7', fontWeight: 600},
  lose: {color: '#e74c3c', fontWeight: 600},
  stats: {fontSize: 14, color: '#a78bfa', lineHeight: 1.8},
  footer: {padding: '0 20px 20px', textAlign: 'center'},
  closeButton: {
    padding: '10px 24px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 8,
    color: '#e8e8e8',
    fontSize: 14,
    cursor: 'pointer',
  },
};
