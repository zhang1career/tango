/**
 * 战斗弹窗 - 回合制战斗
 * 主体攻击客体，累计属性变化，一方血量归零时结束，执行回写并进入结算
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {GameCharacter} from '@/schema/game-character';
import type {GameBehavior} from '@/schema/game-behavior';
import {resolveMediaUrl} from '@/config';

export interface BattleResult {
  rounds: number;
  damageDealt: number;
  damageTaken: number;
  won: boolean;
  playerHpFinal: number;
  enemyHpFinal: number;
}

interface BattleModalProps {
  open: boolean;
  /** 攻击方（主体，通常是玩家角色） */
  subjectChar: GameCharacter | null;
  /** 被攻击方（客体） */
  objectChar: GameCharacter | null;
  /** 当前执行的攻击行为 */
  behavior: GameBehavior | null;
  /** 战斗背景音乐 URL（来自功能板块配置） */
  battleBgm?: string;
  onBattleEnd: (result: BattleResult) => void;
  onClose: () => void;
}

const DEFAULT_HP = 100;
const DEFAULT_STR = 5;

function getAttr(c: GameCharacter | null, key: string, def: number): number {
  const v = c?.attributes?.[key];
  if (typeof v === 'number') return Math.max(0, v);
  return def;
}

export function BattleModal({
  open,
  subjectChar,
  objectChar,
  behavior,
  battleBgm,
  onBattleEnd,
  onClose,
}: BattleModalProps) {
  const [playerHp, setPlayerHp] = useState(DEFAULT_HP);
  const [enemyHp, setEnemyHp] = useState(DEFAULT_HP);
  const [rounds, setRounds] = useState(0);
  const [damageDealt, setDamageDealt] = useState(0);
  const [damageTaken, setDamageTaken] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'fighting' | 'ended'>('idle');
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-14), msg]);
  }, []);

  const initBattle = useCallback(() => {
    const pHp = getAttr(subjectChar, 'hp', DEFAULT_HP);
    const eHp = getAttr(objectChar, 'hp', DEFAULT_HP);
    setPlayerHp(pHp);
    setEnemyHp(eHp);
    setRounds(0);
    setDamageDealt(0);
    setDamageTaken(0);
    setLog([]);
    setPhase('fighting');
    addLog(`战斗开始！${subjectChar?.name ?? '玩家'} vs ${objectChar?.name ?? '敌人'}`);
  }, [subjectChar, objectChar, addLog]);

  useEffect(() => {
    if (!open || !subjectChar || !objectChar) return;
    initBattle();
  }, [open, subjectChar?.id, objectChar?.id, initBattle]);

  // BGM
  useEffect(() => {
    const audio = bgmRef.current;
    if (!open || !battleBgm) {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      return;
    }
    const src = resolveMediaUrl(battleBgm);
    if (audio) {
      audio.src = src;
      audio.loop = true;
      audio.play().catch(() => {});
    }
    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, [open, battleBgm]);

  const doTurn = useCallback(() => {
    if (phase !== 'fighting' || playerHp <= 0 || enemyHp <= 0) return;

    const pStr = getAttr(subjectChar, 'str', DEFAULT_STR);
    const eStr = getAttr(objectChar, 'str', DEFAULT_STR);

    // 玩家攻击
    const dmgToEnemy = Math.max(1, pStr + Math.floor(Math.random() * 6));
    const newEnemyHp = Math.max(0, enemyHp - dmgToEnemy);
    setEnemyHp(newEnemyHp);
    setDamageDealt((d) => d + dmgToEnemy);
    setRounds((r) => r + 1);
    addLog(`${subjectChar?.name ?? '玩家'} 对 ${objectChar?.name ?? '敌人'} 造成 ${dmgToEnemy} 点伤害`);

    if (newEnemyHp <= 0) {
      setPhase('ended');
      addLog(`${objectChar?.name ?? '敌人'} 被击败！`);
      onBattleEnd({
        rounds: rounds + 1,
        damageDealt: damageDealt + dmgToEnemy,
        damageTaken,
        won: true,
        playerHpFinal: playerHp,
        enemyHpFinal: 0,
      });
      return;
    }

    // 敌人反击
    const dmgToPlayer = Math.max(1, eStr + Math.floor(Math.random() * 4));
    const newPlayerHp = Math.max(0, playerHp - dmgToPlayer);
    setPlayerHp(newPlayerHp);
    setDamageTaken((d) => d + dmgToPlayer);
    addLog(`${objectChar?.name ?? '敌人'} 反击造成 ${dmgToPlayer} 点伤害`);

    if (newPlayerHp <= 0) {
      setPhase('ended');
      addLog(`${subjectChar?.name ?? '玩家'} 被击败！`);
      onBattleEnd({
        rounds: rounds + 1,
        damageDealt: damageDealt + dmgToEnemy,
        damageTaken: damageTaken + dmgToPlayer,
        won: false,
        playerHpFinal: 0,
        enemyHpFinal: newEnemyHp,
      });
    }
  }, [phase, playerHp, enemyHp, subjectChar, objectChar, rounds, damageDealt, damageTaken, addLog, onBattleEnd]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
          <span style={styles.title}>战斗</span>
          <button type="button" style={styles.closeBtn} onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div style={styles.battleArea}>
          <div style={styles.side}>
            <div style={styles.avatarPlace}>
              {subjectChar?.avatar ? (
                <img src={resolveMediaUrl(subjectChar.avatar)} alt="" style={styles.avatar} />
              ) : (
                <div style={{...styles.avatar, backgroundColor: '#333', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>?</div>
              )}
            </div>
            <div style={styles.name}>{subjectChar?.name ?? '玩家'}</div>
            <div style={styles.hpBar}>
              <div
                style={{
                  ...styles.hpFill,
                  width: `${Math.max(0, (playerHp / getAttr(subjectChar, 'hp', DEFAULT_HP)) * 100)}%`,
                }}
              />
            </div>
            <div style={styles.hpText}>{playerHp} / {getAttr(subjectChar, 'hp', DEFAULT_HP)}</div>
          </div>

          <div style={styles.vs}>VS</div>

          <div style={styles.side}>
            <div style={styles.avatarPlace}>
              {objectChar?.avatar ? (
                <img src={resolveMediaUrl(objectChar.avatar)} alt="" style={styles.avatar} />
              ) : (
                <div style={{...styles.avatar, backgroundColor: '#333', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>?</div>
              )}
            </div>
            <div style={styles.name}>{objectChar?.name ?? '敌人'}</div>
            <div style={styles.hpBar}>
              <div
                style={{
                  ...styles.hpFill,
                  width: `${Math.max(0, (enemyHp / getAttr(objectChar, 'hp', DEFAULT_HP)) * 100)}%`,
                }}
              />
            </div>
            <div style={styles.hpText}>{enemyHp} / {getAttr(objectChar, 'hp', DEFAULT_HP)}</div>
          </div>
        </div>

        <div style={styles.logArea}>
          {log.map((l, i) => (
            <div key={i} style={styles.logLine}>{l}</div>
          ))}
        </div>

        {phase === 'fighting' && playerHp > 0 && enemyHp > 0 && (
          <div style={{padding: '0 20px 16px', textAlign: 'center'}}>
            <button type="button" style={styles.attackBtn} onClick={doTurn}>
              攻击
            </button>
          </div>
        )}
        {phase === 'ended' && (
          <p style={styles.endedHint}>战斗结束，即将进入结算...</p>
        )}

        <audio ref={bgmRef} loop style={{display: 'none'}} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  modal: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    border: '1px solid #333',
    width: '90%',
    maxWidth: 520,
    maxHeight: '85vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
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
  battleArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  side: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatarPlace: {marginBottom: 8},
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  name: {fontSize: 14, color: '#e8e8e8', marginBottom: 8},
  hpBar: {
    width: 100,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  hpFill: {
    height: '100%',
    backgroundColor: '#6c5ce7',
    transition: 'width 0.3s ease',
  },
  hpText: {fontSize: 12, color: '#888'},
  vs: {fontSize: 20, color: '#6c5ce7', fontWeight: 700},
  logArea: {
    padding: '0 20px 16px',
    maxHeight: 160,
    overflow: 'auto',
    backgroundColor: '#16162a',
    margin: '0 16px 12px',
    borderRadius: 8,
  },
  logLine: {fontSize: 13, color: '#a78bfa', padding: '4px 0'},
  attackBtn: {
    padding: '10px 32px',
    backgroundColor: '#6c5ce7',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  endedHint: {fontSize: 14, color: '#888', textAlign: 'center', padding: '0 0 16px', margin: 0},
};
