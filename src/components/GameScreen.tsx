/**
 * 游戏主画面 - 文字冒险展示
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  type FetchContent,
  GameEngine,
  loadStory,
  getAvailableBehaviors,
  executeBehavior,
  toBehaviorFullId,
  type BehaviorInteractionContext,
} from '@/engine';
import type {GameCharacter} from '@/schema/game-character';
import type {GameRule} from '@/schema/game-rule';
import type {GameBehavior} from '@/schema/game-behavior';

interface GameScreenProps {
  fetchContent: FetchContent;
  className?: string;
}

export function GameScreen({fetchContent, className}: GameScreenProps) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [rules, setRules] = useState<GameRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [behaviorList, setBehaviorList] = useState<GameBehavior[]>([]);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadStory(fetchContent)
      .then((story) => {
        if (cancelled) return;
        setEngine(new GameEngine(story));
        const meta = story.metadata as { characters?: unknown[]; gameRules?: unknown[] } | undefined;
        setCharacters(Array.isArray(meta?.characters) ? (meta.characters as GameCharacter[]) : []);
        setRules(Array.isArray(meta?.gameRules) ? (meta.gameRules as GameRule[]) : []);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchContent]);

  if (loading) {
    return (
      <div className={`game-container ${className ?? ''}`} style={styles.container}>
        <div style={styles.loading}>
          <div className="spinner" style={styles.spinner}/>
          <p style={styles.loadingText}>加载故事中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`game-container ${className ?? ''}`} style={styles.container}>
        <div style={styles.loading}>
          <p style={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  if (!engine) return null;

  const state = engine.getState();
  if (!state?.story) return null;

  const passage = state.currentPassage;
  const characterIds = (passage?.metadata?.characterIds as string[] | undefined) ?? [];

  const behaviorCtx: BehaviorInteractionContext = {
    characters,
    ruleMap: new Map(rules.map((r) => [r.id, r])),
    getState: () => {
      const s = engine.getState();
      return {
        variables: s.variables,
        inventory: s.inventory,
        reputation: s.reputation,
      };
    },
    applyActions: (actions) => engine.applyActions(actions),
    usedBehaviorIds: engine.usedBehaviorIds,
  };

  const handleLink = (passageName: string, link?: import('@/types').PassageLink) => {
    setSelectedCharId(null);
    setBehaviorList([]);
    setLastResponse(null);
    engine.goTo(passageName, link ?? undefined);
    refresh();
  };

  const handleBack = () => {
    setSelectedCharId(null);
    setBehaviorList([]);
    setLastResponse(null);
    engine.goBack();
    refresh();
  };

  const handleRestart = () => {
    setSelectedCharId(null);
    setBehaviorList([]);
    setLastResponse(null);
    engine.restart();
    refresh();
  };

  const handleSelectCharacter = (charId: string) => {
    const list = getAvailableBehaviors(charId, behaviorCtx);
    setSelectedCharId(charId);
    setBehaviorList(list);
    setLastResponse(null);
    refresh();
  };

  const handleExecuteBehavior = (charId: string, b: GameBehavior) => {
    const bid = toBehaviorFullId(charId, b.id);
    const result = executeBehavior(bid, behaviorCtx);
    setLastResponse(result.response);
    setBehaviorList([]);
    refresh();
  };

  const handleClickResponse = () => {
    if (selectedCharId) {
      const list = getAvailableBehaviors(selectedCharId, behaviorCtx);
      setBehaviorList(list);
      setLastResponse(null);
    }
    refresh();
  };

  return (
    <div className={`game-container ${className ?? ''}`} style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>{state.story.title}</h1>
      </header>

      {(state.inventory.length > 0 || Object.keys(state.reputation).length > 0) && (
        <aside style={styles.statusPanel}>
          {state.inventory.length > 0 && (
            <section>
              <strong style={styles.statusLabel}>物品</strong>
              <span style={styles.statusValue}>{state.inventory.join(' · ')}</span>
            </section>
          )}
          {Object.keys(state.reputation).length > 0 && (
            <section>
              <strong style={styles.statusLabel}>声誉</strong>
              <span style={styles.statusValue}>
                {Object.entries(state.reputation)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </span>
            </section>
          )}
        </aside>
      )}

      <main style={styles.scroll}>
        {passage && (
          <>
            <p style={styles.passageName}>{passage.name}</p>
            <p style={styles.passageText}>{passage.text}</p>

            {characterIds.length > 0 && (
              <section style={styles.behaviorPanel}>
                <div style={styles.charList}>
                  <span style={styles.charListLabel}>攀谈：</span>
                  {characterIds.map((cid) => {
                    const c = characters.find((x) => x.id === cid);
                    return (
                      <button
                        key={cid}
                        type="button"
                        style={{
                          ...styles.charButton,
                          ...(selectedCharId === cid ? styles.charButtonActive : {}),
                        }}
                        onClick={() => handleSelectCharacter(cid)}
                      >
                        {c?.name ?? cid}
                      </button>
                    );
                  })}
                </div>
                {selectedCharId && (
                  lastResponse ? (
                    <p
                      style={styles.responseText}
                      onClick={handleClickResponse}
                      onKeyDown={(e) => e.key === 'Enter' && handleClickResponse()}
                      role="button"
                      tabIndex={0}
                    >
                      {lastResponse}
                    </p>
                  ) : behaviorList.length > 0 ? (
                    <ul style={styles.behaviorList}>
                      {behaviorList.map((b) => (
                        <li key={b.id}>
                          <button
                            type="button"
                            style={styles.behaviorButton}
                            onClick={() => handleExecuteBehavior(selectedCharId, b)}
                          >
                            {b.t === 'action' ? `(${b.q})` : b.q}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={styles.emptyHint}>暂无可用行为</p>
                  )
                )}
              </section>
            )}

            <nav style={styles.linkList}>
              {engine.getVisibleLinks().map((link, i) => (
                <button
                  key={i}
                  type="button"
                  style={styles.linkButton}
                  onClick={() => handleLink(link.passageName, link)}
                >
                  {link.displayText.startsWith('前往') ? link.displayText : `前往 ${link.displayText}`}
                </button>
              ))}
            </nav>

            {state.isEnding && engine.getVisibleLinks().length === 0 && (
              <p style={{...styles.passageText, fontStyle: 'italic', color: '#888'}}>
                — 故事结束 —
              </p>
            )}
          </>
        )}
      </main>

      <footer style={styles.toolbar}>
        {engine.canGoBack() && (
          <button type="button" style={styles.toolbarButton} onClick={handleBack}>
            ← 返回
          </button>
        )}
        <button type="button" style={styles.toolbarButton} onClick={handleRestart}>
          重新开始
        </button>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #333',
  },
  statusPanel: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#252540',
    borderRadius: 8,
    fontSize: 14,
  },
  statusLabel: {color: '#a78bfa', marginRight: 8},
  statusValue: {color: '#c4b5fd'},
  title: {fontSize: 18, color: '#e8e8e8', fontWeight: 600, margin: 0},
  scroll: {flex: 1, overflow: 'auto', paddingBottom: 40},
  passageName: {fontSize: 14, color: '#888', marginBottom: 12},
  passageText: {fontSize: 17, lineHeight: 1.6, color: '#d4d4d4', marginBottom: 24, whiteSpace: 'pre-wrap'},
  linkList: {display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16},
  behaviorPanel: {marginTop: 16, paddingTop: 16, borderTop: '1px solid #333'},
  charList: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12},
  charListLabel: {fontSize: 14, color: '#888'},
  charButton: {
    padding: '6px 12px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#c4b5fd',
    fontSize: 14,
    cursor: 'pointer',
  },
  charButtonActive: {borderColor: '#6c5ce7', color: '#e8e8e8'},
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
  responseText: {
    padding: 14,
    backgroundColor: '#252540',
    borderRadius: 8,
    color: '#d4d4d4',
    fontSize: 15,
    lineHeight: 1.5,
    cursor: 'pointer',
    margin: 0,
    borderLeft: '4px solid #a78bfa',
  },
  emptyHint: {fontSize: 14, color: '#888', margin: 0},
  linkButton: {
    backgroundColor: '#2d2d44',
    padding: '14px 18px',
    borderRadius: 8,
    border: 'none',
    borderLeft: '4px solid #6c5ce7',
    color: '#e8e8e8',
    fontSize: 16,
    textAlign: 'left',
    cursor: 'pointer',
  },
  toolbar: {display: 'flex', gap: 12, marginTop: 16},
  toolbarButton: {
    padding: '8px 14px',
    backgroundColor: '#333',
    borderRadius: 6,
    border: 'none',
    color: '#999',
    fontSize: 14,
    cursor: 'pointer',
  },
  loading: {flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'},
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid #333',
    borderTopColor: '#6c5ce7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {color: '#888', marginTop: 12},
  error: {color: '#e74c3c', padding: 16, textAlign: 'center'},
};
