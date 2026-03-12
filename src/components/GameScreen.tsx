/**
 * 游戏主画面 - 文字冒险展示
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  type FetchContent,
  GameEngine,
  loadStory,
  executeBehavior,
  toBehaviorFullId,
  shouldOpenBattle,
  executeBattleWriteback,
  checkEventAdmission,
  executeEvent,
  resumeEventExecution,
  type BehaviorInteractionContext,
  type PendingEventBattle,
} from '@/engine';
import type {GameCharacter} from '@/schema/game-character';
import type {GameRule} from '@/schema/game-rule';
import type {GameEvent} from '@/schema/game-event';
import type {GameBehavior} from '@/schema/game-behavior';
import {resolveMediaUrl, getEventsFetchUrl, getFeaturesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {sanitizePassageContent} from '@/utils/sanitize';
import {
  BehaviorInteractionModal,
  type BehaviorHistoryEntry,
} from './BehaviorInteractionModal';
import {BattleModal, type BattleResult} from './BattleModal';
import {BattleSettlementModal} from './BattleSettlementModal';

interface GameScreenProps {
  fetchContent: FetchContent;
  className?: string;
}

export function GameScreen({fetchContent, className}: GameScreenProps) {
  const {gameId} = useGameId();
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [rules, setRules] = useState<GameRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [, setBehaviorList] = useState<GameBehavior[]>([]);
  const [, setLastResponse] = useState<string | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const [behaviorHistory, setBehaviorHistory] = useState<BehaviorHistoryEntry[]>([]);
  const behaviorSeqRef = useRef(0);
  const [battleOpen, setBattleOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleSubjectChar, setBattleSubjectChar] = useState<GameCharacter | null>(null);
  const [battleObjectChar, setBattleObjectChar] = useState<GameCharacter | null>(null);
  const [pendingBattleBehavior, setPendingBattleBehavior] = useState<{ charId: string; b: GameBehavior } | null>(null);
  const pendingBattleRef = useRef<{ charId: string; b: GameBehavior } | null>(null);
  const [featuresConfig, setFeaturesConfig] = useState<{ battle?: { backgroundMusic?: string } } | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eventPhaseReady, setEventPhaseReady] = useState(false);
  const pendingEventBattleRef = useRef<PendingEventBattle | null>(null);
  const eventPhaseRunRef = useRef<string | null>(null);
  const [eventMediaOverlay, setEventMediaOverlay] = useState<{ type: 'opening' | 'ending'; url: string; event: GameEvent } | null>(null);
  const eventBgmRef = useRef<HTMLAudioElement | null>(null);
  const runEventPhaseRef = useRef<() => void>(() => {});

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);
  const passageContentRef = useRef<HTMLDivElement>(null);
  const introPlayedRef = useRef<Set<string>>(new Set());
  const bgmRef = useRef<HTMLAudioElement | null>(null);

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

  // 加载事件
  useEffect(() => {
    const url = getEventsFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((d: unknown) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]));
  }, [gameId]);

  // 加载功能板块配置（战斗背景音乐等）
  useEffect(() => {
    const url = getFeaturesFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : {}))
      .then((d: { battle?: { backgroundMusic?: string } } | null) => setFeaturesConfig(d ?? null))
      .catch(() => setFeaturesConfig(null));
  }, [gameId]);

  useEffect(() => {
    const el = passageContentRef.current;
    if (!el) return;
    const carousels = el.querySelectorAll<HTMLDivElement>('.media-carousel');
    const intervals: ReturnType<typeof setInterval>[] = [];
    carousels.forEach((div) => {
      const raw = div.getAttribute('data-images');
      if (!raw) return;
      try {
        const urls = JSON.parse(raw.replace(/&quot;/g, '"')) as string[];
        if (urls.length < 2) return;
        const img = div.querySelector('img');
        if (!img) return;
        let i = 0;
        const t = setInterval(() => {
          i = (i + 1) % urls.length;
          img.src = urls[i];
        }, 4000);
        intervals.push(t);
      } catch {
        // ignore
      }
    });
    return () => intervals.forEach(clearInterval);
  }, [engine?.getState()?.currentPassage?.id]);

  // BGM: play when passage has backgroundMusic, intro done, and event phase done (event phase uses event's BGM)
  useEffect(() => {
    const passage = engine?.getState()?.currentPassage;
    const url = passage?.metadata?.backgroundMusic as string | undefined;
    const opening = passage?.metadata?.openingAnimation as string | undefined;
    const shouldPlay =
      url &&
      (!opening || introPlayedRef.current.has(passage?.id ?? '')) &&
      eventPhaseReady;
    const audio = bgmRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    if (url && shouldPlay) {
      const src = resolveMediaUrl(url);
      if (audio) {
        audio.src = src;
        audio.loop = true;
        audio.play().catch(() => {});
      }
    }
  }, [engine?.getState()?.currentPassage?.id, introVisible, eventPhaseReady]);

  // Set introVisible when entering passage with openingAnimation (first time)
  useEffect(() => {
    const passage = engine?.getState()?.currentPassage;
    const opening = passage?.metadata?.openingAnimation as string | undefined;
    if (opening && passage?.id && !introPlayedRef.current.has(passage.id)) {
      setIntroVisible(true);
    } else {
      setIntroVisible(false);
    }
  }, [engine?.getState()?.currentPassage?.id]);

  const handleIntroEnded = useCallback(() => {
    const passageId = engine?.getState()?.currentPassage?.id;
    if (passageId) introPlayedRef.current.add(passageId);
    setIntroVisible(false);
    refresh();
  }, [engine, refresh]);

  const state = engine?.getState();
  const passage = state?.currentPassage ?? null;
  const passageId = passage?.id ?? '';

  const buildEvtCtx = useCallback(
    () => ({
      events,
      characters,
      ruleMap: new Map(rules.map((r) => [r.id, r])),
      features: featuresConfig,
      getState: () => {
        const s = engine!.getState();
        return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
      },
      applyActions: (a: Parameters<GameEngine['applyActions']>[0]) => engine!.applyActions(a),
      usedEventIds: engine!.usedEventIds,
      usedBehaviorIds: engine!.usedBehaviorIds,
    }),
    [engine, events, characters, rules, featuresConfig]
  );

  const doExecuteEventAndMaybeEnding = useCallback(
    (evt: GameEvent) => {
      if (!engine || !passage) return;
      if (evt.backgroundMusic && eventBgmRef.current) {
        eventBgmRef.current.src = resolveMediaUrl(evt.backgroundMusic);
        eventBgmRef.current.loop = true;
        eventBgmRef.current.play().catch(() => {});
      }
      const evtCtx = buildEvtCtx();
      const result = executeEvent(evt, evtCtx);
      if (!result.completed && result.pendingBattle) {
        const { item, behavior } = result.pendingBattle;
        const subjChar = characters.find((c) => c.id === item.subject);
        const objChar = characters.find((c) => c.id === (item.object ?? ''));
        pendingEventBattleRef.current = result.pendingBattle;
        setBattleSubjectChar(subjChar ?? null);
        setBattleObjectChar(objChar ?? null);
        setPendingBattleBehavior({ charId: item.object ?? item.subject, b: behavior });
        setBattleOpen(true);
        return;
      }
      if (evt.endingAnimation) {
        setEventMediaOverlay({ type: 'ending', url: evt.endingAnimation, event: evt });
        return;
      }
      runEventPhaseRef.current();
    },
    [engine, passage, buildEvtCtx, characters]
  );

  const runEventPhase = useCallback(() => {
    if (!engine || !passage || events.length === 0) {
      if (eventBgmRef.current) {
        eventBgmRef.current.pause();
        eventBgmRef.current.src = '';
      }
      setEventPhaseReady(true);
      return;
    }
    const eventIds = (passage.metadata?.eventIds as string[] | undefined) ?? [];
    if (eventIds.length === 0) {
      if (eventBgmRef.current) {
        eventBgmRef.current.pause();
        eventBgmRef.current.src = '';
      }
      setEventPhaseReady(true);
      return;
    }
    const evtCtx = buildEvtCtx();
    for (const eid of eventIds) {
      const evt = events.find((e) => e.id === eid);
      if (!evt || !checkEventAdmission(evt, evtCtx)) continue;
      if (evt.openingAnimation) {
        setEventMediaOverlay({ type: 'opening', url: evt.openingAnimation, event: evt });
        return;
      }
      doExecuteEventAndMaybeEnding(evt);
      return;
    }
    if (eventBgmRef.current) {
      eventBgmRef.current.pause();
      eventBgmRef.current.src = '';
    }
    setEventPhaseReady(true);
  }, [engine, passage, events, buildEvtCtx, doExecuteEventAndMaybeEnding]);

  useEffect(() => {
    runEventPhaseRef.current = runEventPhase;
  }, [runEventPhase]);

  const handleEventMediaEnded = useCallback(
    (overlay: { type: 'opening' | 'ending'; url: string; event: GameEvent }) => {
      setEventMediaOverlay(null);
      if (overlay.type === 'opening') {
      doExecuteEventAndMaybeEnding(overlay.event);
    } else {
      if (eventBgmRef.current) {
        eventBgmRef.current.pause();
        eventBgmRef.current.src = '';
      }
      runEventPhaseRef.current();
    }
    refresh();
  },
    [doExecuteEventAndMaybeEnding, refresh]
  );

  useEffect(() => {
    setEventPhaseReady(false);
  }, [passageId]);

  useEffect(() => {
    if (!passage || introVisible) return;
    if (eventPhaseRunRef.current === passageId) return;
    eventPhaseRunRef.current = passageId;
    runEventPhase();
  }, [passageId, introVisible, runEventPhase]);

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

  if (!state?.story) return null;

  const characterIds = (passage?.metadata?.characterIds as string[] | undefined) ?? [];
  const sceneImages = (passage?.metadata?.images as string[] | undefined) ?? [];
  const resolvedImages = sceneImages.map((u) => resolveMediaUrl(u)).filter(Boolean);
  const openingAnimation = passage?.metadata?.openingAnimation as string | undefined;
  const backgroundMusic = passage?.metadata?.backgroundMusic as string | undefined;

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
    setBehaviorHistory([]);
    behaviorSeqRef.current = 0;
    introPlayedRef.current.clear();
    engine.restart();
    refresh();
  };

  const handleSelectCharacter = (charId: string) => {
    setSelectedCharId(charId);
    setBehaviorList([]);
    setLastResponse(null);
    refresh();
  };

  const handleCloseBehaviorModal = () => {
    setSelectedCharId(null);
    setBehaviorList([]);
    setLastResponse(null);
    refresh();
  };

  const handleExecuteBehavior = (charId: string, b: GameBehavior) => {
    if (shouldOpenBattle(b, featuresConfig)) {
      const playerId = (state?.story?.metadata as { playerCharacterId?: string })?.playerCharacterId
        ?? characters[0]?.id
        ?? 'player';
      const playerChar = characters.find((c) => c.id === playerId) ?? characters[0];
      const enemyChar = characters.find((c) => c.id === charId) ?? null;
      setBattleSubjectChar(playerChar ?? null);
      setBattleObjectChar(enemyChar);
      const pending = { charId, b };
      setPendingBattleBehavior(pending);
      pendingBattleRef.current = pending;
      setBattleOpen(true);
      setSelectedCharId(null);
      return;
    }
    const bid = toBehaviorFullId(charId, b.id);
    const result = executeBehavior(bid, behaviorCtx);
    const seq = behaviorSeqRef.current++;
    setBehaviorHistory((prev) => [
      ...prev,
      {charId, behaviorId: b.id, q: b.q, response: result.response, seq},
    ]);
    setLastResponse(result.response);
    setBehaviorList([]);
    refresh();
  };

  const handleBattleEnd = (result: BattleResult) => {
    setBattleOpen(false);
    setBattleResult(result);
    const pendingEvt = pendingEventBattleRef.current;
    if (pendingEvt && engine) {
      pendingEventBattleRef.current = null;
      setPendingBattleBehavior(null);
      const evtCtx = {
        events,
        characters,
        ruleMap: new Map(rules.map((r) => [r.id, r])),
        features: featuresConfig,
        getState: () => {
          const s = engine.getState();
          return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
        },
        applyActions: (a: Parameters<GameEngine['applyActions']>[0]) => engine.applyActions(a),
        usedEventIds: engine.usedEventIds,
        usedBehaviorIds: engine.usedBehaviorIds,
      };
      const resumeResult = resumeEventExecution(pendingEvt, result, evtCtx);
      if (!resumeResult.completed && resumeResult.pendingBattle) {
        const { item, behavior } = resumeResult.pendingBattle;
        const subjChar = characters.find((c) => c.id === item.subject);
        const objChar = characters.find((c) => c.id === (item.object ?? ''));
        pendingEventBattleRef.current = resumeResult.pendingBattle;
        setBattleSubjectChar(subjChar ?? null);
        setBattleObjectChar(objChar ?? null);
        setPendingBattleBehavior({ charId: item.object ?? item.subject, b: behavior });
        setBattleOpen(true);
      } else {
        const evt = pendingEvt.event;
        if (evt.endingAnimation) {
          setEventMediaOverlay({ type: 'ending', url: evt.endingAnimation, event: evt });
        } else {
          if (eventBgmRef.current) {
            eventBgmRef.current.pause();
            eventBgmRef.current.src = '';
          }
          runEventPhaseRef.current();
        }
      }
      refresh();
      setSettlementOpen(true);
      return;
    }
    const pending = pendingBattleRef.current;
    pendingBattleRef.current = null;
    setPendingBattleBehavior(null);
    if (pending && engine) {
      const bid = toBehaviorFullId(pending.charId, pending.b.id);
      const ctx: BehaviorInteractionContext = {
        characters,
        ruleMap: new Map(rules.map((r) => [r.id, r])),
        getState: () => {
          const s = engine.getState();
          return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
        },
        applyActions: (actions) => engine.applyActions(actions),
        usedBehaviorIds: engine.usedBehaviorIds,
      };
      executeBattleWriteback(bid, pending.b, result, ctx);
      refresh();
    }
    setSettlementOpen(true);
  };

  const handleSettlementClose = () => {
    setSettlementOpen(false);
    setBattleResult(null);
    setBattleSubjectChar(null);
    setBattleObjectChar(null);
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

      <audio ref={eventBgmRef} loop style={{display: 'none'}} />
      <main style={styles.scroll}>
        {passage && (
          <>
            {introVisible && openingAnimation && (
              <div style={overlayStyles.overlay}>
                <video
                  src={resolveMediaUrl(openingAnimation)}
                  autoPlay
                  muted
                  playsInline
                  onEnded={handleIntroEnded}
                  style={overlayStyles.video}
                />
              </div>
            )}
            {eventMediaOverlay && (
              <div style={overlayStyles.overlay}>
                <video
                  src={resolveMediaUrl(eventMediaOverlay.url)}
                  autoPlay
                  muted
                  playsInline
                  onEnded={() => handleEventMediaEnded(eventMediaOverlay)}
                  style={overlayStyles.video}
                />
              </div>
            )}
            {!introVisible && eventPhaseReady && (
              <>
                <p style={styles.passageName}>{passage.name}</p>
                <div ref={passageContentRef} className="passage-content">
                  {resolvedImages.length > 0 && (
                    <div
                      className="media-carousel"
                      data-images={JSON.stringify(resolvedImages)}
                      style={{marginBottom: 16}}
                    >
                      <img src={resolvedImages[0]} alt="" style={{maxWidth: '100%', borderRadius: 8}} />
                    </div>
                  )}
                  <div
                    style={styles.passageText}
                    dangerouslySetInnerHTML={{__html: sanitizePassageContent(passage.text)}}
                  />
                </div>
                <audio ref={bgmRef} loop style={{display: 'none'}} />

            {characterIds.length > 0 && (
              <section style={styles.behaviorPanel}>
                <div style={styles.charList}>
                  <span style={styles.charListLabel}>攀谈：</span>
                  {characterIds.map((cid) => {
                    const c = characters.find((x) => x.id === cid);
                    const avatarUrl = c?.avatar ? resolveMediaUrl(c.avatar) : undefined;
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
                        {avatarUrl && (
                          <img
                            src={avatarUrl}
                            alt=""
                            style={{width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', marginRight: 6}}
                          />
                        )}
                        {c?.name ?? cid}
                      </button>
                    );
                  })}
                </div>
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
                  {link.displayText.startsWith('前往') || link.displayText === '继续' ? link.displayText : `前往 ${link.displayText}`}
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

      <BehaviorInteractionModal
        open={!!selectedCharId}
        character={selectedCharId ? characters.find((c) => c.id === selectedCharId) ?? null : null}
        characters={characters}
        behaviorCtx={behaviorCtx}
        history={behaviorHistory}
        onExecute={handleExecuteBehavior}
        onClose={handleCloseBehaviorModal}
      />

      <BattleModal
        open={battleOpen}
        subjectChar={battleSubjectChar}
        objectChar={battleObjectChar}
        behavior={pendingBattleBehavior?.b ?? null}
        battleBgm={featuresConfig?.battle?.backgroundMusic}
        onBattleEnd={handleBattleEnd}
        onClose={() => {
          setBattleOpen(false);
          pendingBattleRef.current = null;
          setPendingBattleBehavior(null);
          refresh();
        }}
      />

      <BattleSettlementModal
        open={settlementOpen}
        result={battleResult}
        playerName={battleSubjectChar?.name ?? '玩家'}
        enemyName={battleObjectChar?.name ?? '敌人'}
        onClose={handleSettlementClose}
      />
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

const overlayStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    backgroundColor: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
};
