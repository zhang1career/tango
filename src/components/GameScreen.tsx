/**
 * 游戏主画面 - 文字冒险展示
 */

import React, {useCallback, useEffect, useState} from 'react';
import {type FetchContent, GameEngine, loadStory} from '@/engine';

interface GameScreenProps {
  fetchContent: FetchContent;
  className?: string;
}

export function GameScreen({fetchContent, className}: GameScreenProps) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadStory(fetchContent)
      .then((story) => {
        if (!cancelled) {
          setEngine(new GameEngine(story));
          setLoading(false);
        }
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

  const handleLink = (passageName: string, link?: import('@/types').PassageLink) => {
    engine.goTo(passageName, link ?? undefined);
    refresh();
  };

  const handleBack = () => {
    engine.goBack();
    refresh();
  };

  const handleRestart = () => {
    engine.restart();
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

            <nav style={styles.linkList}>
              {engine.getVisibleLinks().map((link, i) => (
                <button
                  key={i}
                  type="button"
                  style={styles.linkButton}
                  onClick={() => handleLink(link.passageName, link)}
                >
                  {link.displayText}
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
  linkList: {display: 'flex', flexDirection: 'column', gap: 10},
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
