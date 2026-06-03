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
  triggerSetOnRules,
} from '@/engine';
import type {GameCharacter} from '@/schema/game-character';
import type {GameRule} from '@/schema/game-rule';
import type {GameEvent} from '@/schema/game-event';
import type {GameBehavior} from '@/schema/game-behavior';
import type {GameItem} from '@/schema/game-item';
import type {GameActionRef} from '@/schema/action-ref';
import type {SceneCharacterOverride} from '@/schema/game-scene';
import type {GameScene} from '@/schema/game-scene';
import {EMPTY_JOURNAL_CATALOG, normalizeJournalCatalog, type StoryJournalCatalog} from '@/schema/story-journal';
import {groupJournalByTheme} from '@/utils/journal-display';
import {resolveMediaUrl, getEventsFetchUrl, getFeaturesFetchUrl, getItemsFetchUrl, getScenesFetchUrl, getJournalFetchUrl, getAppMode} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {sanitizePassageContent} from '@/utils/sanitize';
import {resolveSceneIdFromPassage} from '@/utils/scene-id';
import {resolvePassageDisplayTitle} from '@/utils/passage-display-title';
import {
  BehaviorInteractionModal,
  type BehaviorHistoryEntry,
} from './BehaviorInteractionModal';
import {BattleModal, type BattleResult} from './BattleModal';
import {BattleSettlementModal} from './BattleSettlementModal';
import {InventoryModal} from './InventoryModal';
import {JournalModal} from './JournalModal';
import {MessageTicker} from './MessageTicker';

interface GameScreenProps {
  fetchContent: FetchContent;
  className?: string;
  audioMuted?: boolean;
}

function applySceneOverridesToCharacters(
  baseCharacters: GameCharacter[],
  overrides?: Record<string, SceneCharacterOverride>
): GameCharacter[] {
  if (!overrides || Object.keys(overrides).length === 0) return baseCharacters;
  return baseCharacters.map((c) => {
    const o = overrides[c.id];
    if (!o) return c;
    return {
      ...c,
      description: o.description ?? c.description,
      attributes: o.attributes ?? c.attributes,
      inventory: o.inventory ?? c.inventory,
      behaviorLibrary: o.behaviorLibrary ?? c.behaviorLibrary,
    };
  });
}

export function GameScreen({fetchContent, className, audioMuted = false}: GameScreenProps) {
  const {gameId} = useGameId();
  const isProdMode = getAppMode() === 'prod';
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
  const [scenes, setScenes] = useState<GameScene[]>([]);
  const [itemCatalog, setItemCatalog] = useState<GameItem[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalCatalog, setJournalCatalog] = useState<StoryJournalCatalog>(EMPTY_JOURNAL_CATALOG);
  const [activeInventoryItemBgm, setActiveInventoryItemBgm] = useState<string | undefined>(undefined);
  const [eventPhaseReady, setEventPhaseReady] = useState(false);
  const pendingEventBattleRef = useRef<PendingEventBattle | null>(null);
  const eventPhaseRunRef = useRef<string | null>(null);
  const [eventMediaOverlay, setEventMediaOverlay] = useState<{ type: 'opening' | 'ending'; url: string; event: GameEvent } | null>(null);
  const [navWarning, setNavWarning] = useState<string | null>(null);
  const eventBgmRef = useRef<HTMLAudioElement | null>(null);
  const runEventPhaseRef = useRef<() => void>(() => {});
  const initialSceneTriggerRef = useRef<string | null>(null);

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
        const meta = story.metadata as {
          characters?: unknown[];
          gameRules?: unknown[];
          events?: unknown[];
          items?: unknown[];
          journal?: unknown;
          features?: { battle?: { backgroundMusic?: string } };
        } | undefined;
        setCharacters(Array.isArray(meta?.characters) ? (meta.characters as GameCharacter[]) : []);
        setRules(Array.isArray(meta?.gameRules) ? (meta.gameRules as GameRule[]) : []);
        if (meta?.journal) {
          setJournalCatalog(normalizeJournalCatalog(meta.journal));
        }
        if (isProdMode) {
          const prodScenes = Array.isArray((meta as { scenes?: unknown[] } | undefined)?.scenes)
            ? (((meta as { scenes?: unknown[] }).scenes ?? []) as GameScene[])
            : [];
          setEvents(Array.isArray(meta?.events) ? (meta.events as GameEvent[]) : []);
          setScenes(prodScenes);
          setItemCatalog(Array.isArray(meta?.items) ? (meta.items as GameItem[]) : []);
          setFeaturesConfig(meta?.features ?? null);
        }
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
  }, [fetchContent, isProdMode]);

  useEffect(() => {
    let cancelled = false;
    fetch(getJournalFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : EMPTY_JOURNAL_CATALOG))
      .then((data) => {
        if (!cancelled) setJournalCatalog(normalizeJournalCatalog(data));
      })
      .catch(() => {
        if (!cancelled) setJournalCatalog(EMPTY_JOURNAL_CATALOG);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const handleGameAction = useCallback(
    (actionRef: GameActionRef) => {
      if (!engine || rules.length === 0) return;
      const s = engine.getState();
      triggerSetOnRules({
        actionRef,
        rules,
        state: {variables: s.variables, inventory: s.inventory, reputation: s.reputation},
        applyActions: (actions) => engine.applyActions(actions),
      });
      refresh();
    },
    [engine, refresh, rules]
  );

  useEffect(() => {
    if (!engine) return;
    return engine.onAction(handleGameAction);
  }, [engine, handleGameAction]);

  useEffect(() => {
    if (!engine) return;
    if (initialSceneTriggerRef.current === engine.getState().story.startPassageId) return;
    const current = engine.getState().currentPassage;
    const sceneId = resolveSceneIdFromPassage(current) ?? current?.id;
    if (!sceneId) return;
    initialSceneTriggerRef.current = engine.getState().story.startPassageId;
    handleGameAction({type: 'scene.enter', sceneId});
  }, [engine, handleGameAction]);

  // 开发模式：从独立 JSON 加载（编辑器维护）；prod 已在 story.tw StoryData 中
  useEffect(() => {
    if (isProdMode) return;
    const url = getScenesFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((d: unknown) => setScenes(Array.isArray(d) ? (d as GameScene[]) : []))
      .catch(() => setScenes([]));
  }, [gameId, isProdMode]);

  useEffect(() => {
    if (isProdMode) return;
    const url = getEventsFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((d: unknown) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]));
  }, [gameId, isProdMode]);

  useEffect(() => {
    if (isProdMode) return;
    const url = getItemsFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((d: unknown) => setItemCatalog(Array.isArray(d) ? d : []))
      .catch(() => setItemCatalog([]));
  }, [gameId, isProdMode]);

  useEffect(() => {
    if (isProdMode) return;
    const url = getFeaturesFetchUrl(gameId);
    fetch(url)
      .then((res) => (res.ok ? res.json() : {}))
      .then((d: { battle?: { backgroundMusic?: string } } | null) => setFeaturesConfig(d ?? null))
      .catch(() => setFeaturesConfig(null));
  }, [gameId, isProdMode]);

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

  // BGM priority: battle/event > character > inventory-item > scene
  useEffect(() => {
    const passage = engine?.getState()?.currentPassage;
    const sceneBgm = passage?.metadata?.backgroundMusic as string | undefined;
    const characterBgm = selectedCharId
      ? characters.find((c) => c.id === selectedCharId)?.backgroundMusic
      : undefined;
    const url = characterBgm || activeInventoryItemBgm || sceneBgm;
    const opening = passage?.metadata?.openingAnimation as string | undefined;
    const shouldPlay =
      url &&
      (!opening || introPlayedRef.current.has(passage?.id ?? '')) &&
      eventPhaseReady &&
      !battleOpen &&
      !audioMuted;
    const audio = bgmRef.current;
    if (audio) {
      audio.muted = audioMuted;
      audio.pause();
      audio.src = '';
    }
    if (url && shouldPlay) {
      const src = resolveMediaUrl(url, gameId);
      if (audio) {
        audio.src = src;
        audio.loop = true;
        audio.play().catch(() => {});
      }
    }
  }, [
    engine?.getState()?.currentPassage?.id,
    introVisible,
    eventPhaseReady,
    audioMuted,
    gameId,
    selectedCharId,
    characters,
    activeInventoryItemBgm,
    battleOpen,
  ]);

  useEffect(() => {
    if (!audioMuted) return;
    if (bgmRef.current) bgmRef.current.pause();
    if (eventBgmRef.current) eventBgmRef.current.pause();
  }, [audioMuted]);

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

  const handleIntroError = useCallback(() => {
    const passageId = engine?.getState()?.currentPassage?.id;
    if (passageId) introPlayedRef.current.add(passageId);
    setIntroVisible(false);
    refresh();
  }, [engine, refresh]);

  const state = engine?.getState();
  const journalGroups = state
    ? groupJournalByTheme(journalCatalog, state.variables)
    : [];
  const journalCount = journalGroups.reduce((n, g) => n + g.entries.length, 0);
  const passage = state?.currentPassage ?? null;
  const passageId = passage?.id ?? '';
  const sceneCharacterOverrides = (passage?.metadata?.characterOverrides as Record<string, SceneCharacterOverride> | undefined) ?? undefined;
  const activeCharacters = applySceneOverridesToCharacters(characters, sceneCharacterOverrides);

  const currentSceneId = resolveSceneIdFromPassage(passage);
  const sceneMetaMessages = ((passage?.metadata?.messages as string[] | undefined) ?? [])
    .map((m) => String(m).trim())
    .filter(Boolean);
  const sceneJsonMessages = currentSceneId
    ? (scenes.find((s) => s.id === currentSceneId)?.messages ?? []).map((m) => String(m).trim()).filter(Boolean)
    : [];
  const sceneMessages = sceneMetaMessages.length > 0 ? sceneMetaMessages : sceneJsonMessages;
  const sceneEventIds = ((passage?.metadata?.eventIds as string[] | undefined) ?? []).filter(Boolean);
  const sceneEvents = sceneEventIds
    .map((eid) => events.find((evt) => evt.id === eid))
    .filter(Boolean) as GameEvent[];
  const eventMessages = sceneEvents.flatMap((evt) =>
    (evt.messages ?? []).map((m) => String(m).trim()).filter(Boolean)
  );
  const tickerMessages = sceneEventIds.length > 0 ? eventMessages : sceneMessages;

  const buildEvtCtx = useCallback(
    () => {
      const currentPassage = engine?.getState()?.currentPassage ?? null;
      const overrides = (currentPassage?.metadata?.characterOverrides as Record<string, SceneCharacterOverride> | undefined) ?? undefined;
      return {
      events,
      characters: applySceneOverridesToCharacters(characters, overrides),
      ruleMap: new Map(rules.map((r) => [r.id, r])),
      features: featuresConfig,
      getState: () => {
        const s = engine!.getState();
        return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
      },
      applyActions: (a: Parameters<GameEngine['applyActions']>[0]) => engine!.applyActions(a),
      usedEventIds: engine!.usedEventIds,
      usedBehaviorIds: engine!.usedBehaviorIds,
      onAction: handleGameAction,
    };
  },
    [engine, events, characters, rules, featuresConfig, handleGameAction]
  );

  const doExecuteEventAndMaybeEnding = useCallback(
    (evt: GameEvent) => {
      if (!engine || !passage) return;
      if (!audioMuted && evt.backgroundMusic && eventBgmRef.current) {
        eventBgmRef.current.src = resolveMediaUrl(evt.backgroundMusic, gameId);
        eventBgmRef.current.muted = audioMuted;
        eventBgmRef.current.loop = true;
        eventBgmRef.current.play().catch(() => {});
      }
      const evtCtx = buildEvtCtx();
      const result = executeEvent(evt, evtCtx);
      if (!result.completed && result.pendingBattle) {
        const { item, behavior } = result.pendingBattle;
        const subjChar = evtCtx.characters.find((c) => c.id === item.subject);
        const objChar = evtCtx.characters.find((c) => c.id === (item.object ?? ''));
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
    [engine, passage, buildEvtCtx, audioMuted, gameId]
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

  const handleEventMediaError = useCallback(
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
  const inventoryIds = state.inventory;
  const showActionRow = true;
  const showBackpack = inventoryIds.length > 0;
  const sceneImages = (passage?.metadata?.images as string[] | undefined) ?? [];
  const resolvedImages = sceneImages.map((u) => resolveMediaUrl(u, gameId)).filter(Boolean);
  const openingAnimation = passage?.metadata?.openingAnimation as string | undefined;
  const backgroundMusic = passage?.metadata?.backgroundMusic as string | undefined;

  const behaviorCtx: BehaviorInteractionContext = {
    characters: activeCharacters,
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
    currentSceneId,
    onAction: handleGameAction,
  };

  const technicalIdRe = /^ch\d+\.scene_\d+(?:\.p_\d+)?$/;
  const technicalIdLooseRe = /^ch\d+\.[a-zA-Z0-9_-]+(?:\.p_\d+)?$/;

  const getReadablePassageName = (target: import('@/types').Passage | null | undefined): string =>
    resolvePassageDisplayTitle(state.story, target);

  const readablePassageName = getReadablePassageName(passage);
  const readableStoryTitle = technicalIdLooseRe.test(state.story.title.trim())
    ? '未命名故事'
    : state.story.title;

  const getLinkLabel = (link: import('@/types').PassageLink): string => {
    const raw = (link.displayText || link.passageName || '').trim();
    if (!raw) return '继续';
    if (raw === '继续') return raw;
    const stripped = raw.startsWith('前往') ? raw.replace(/^前往\s*/, '').trim() : raw;
    if (technicalIdRe.test(stripped)) {
      const target = engine.getPassage(link.passageName);
      const targetReadable = getReadablePassageName(target);
      return targetReadable ? `前往 ${targetReadable}` : '继续';
    }
    return raw.startsWith('前往') ? raw : `前往 ${raw}`;
  };

  const handleLink = (passageName: string, link?: import('@/types').PassageLink) => {
    setSelectedCharId(null);
    setBehaviorList([]);
    setLastResponse(null);
    let ok = engine.goTo(passageName, link ?? undefined);
    if (!ok && /^ch\d+\.scene_\d+$/.test(passageName.trim())) {
      // 兼容历史数据：章节入口常写 base id，实际首屏是 .p_100
      ok = engine.goTo(`${passageName.trim()}.p_100`, link ?? undefined);
    }
    // 支线末端返回主线时，自动越过“纯继续分页”，减少不必要点击。
    const shouldAutoAdvanceOnReturn =
      !!(passage?.metadata as { branchTerminal?: boolean } | undefined)?.branchTerminal;
    if (ok && shouldAutoAdvanceOnReturn) {
      for (let i = 0; i < 50; i++) {
        const visible = engine.getVisibleLinks();
        if (visible.length !== 1) break;
        const only = visible[0];
        const label = (only.displayText ?? '').trim();
        if (label !== '继续') break;
        if (!engine.goTo(only.passageName, only)) break;
      }
    }
    if (!ok) {
      setNavWarning('该选项暂时无法跳转：目标场景不存在或数据未同步。');
      refresh();
      return;
    }
    setNavWarning(null);
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
    setJournalOpen(false);
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
        ?? activeCharacters[0]?.id
        ?? 'player';
      const playerChar = activeCharacters.find((c) => c.id === playerId) ?? activeCharacters[0];
      const enemyChar = activeCharacters.find((c) => c.id === charId) ?? null;
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
        characters: applySceneOverridesToCharacters(
          characters,
          (engine.getState().currentPassage?.metadata?.characterOverrides as Record<string, SceneCharacterOverride> | undefined) ?? undefined
        ),
        ruleMap: new Map(rules.map((r) => [r.id, r])),
        features: featuresConfig,
        getState: () => {
          const s = engine.getState();
          return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
        },
        applyActions: (a: Parameters<GameEngine['applyActions']>[0]) => engine.applyActions(a),
        usedEventIds: engine.usedEventIds,
        usedBehaviorIds: engine.usedBehaviorIds,
        onAction: handleGameAction,
      };
      const resumeResult = resumeEventExecution(pendingEvt, result, evtCtx);
      if (!resumeResult.completed && resumeResult.pendingBattle) {
        const { item, behavior } = resumeResult.pendingBattle;
        const subjChar = evtCtx.characters.find((c) => c.id === item.subject);
        const objChar = evtCtx.characters.find((c) => c.id === (item.object ?? ''));
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
        characters: applySceneOverridesToCharacters(
          characters,
          (engine.getState().currentPassage?.metadata?.characterOverrides as Record<string, SceneCharacterOverride> | undefined) ?? undefined
        ),
        ruleMap: new Map(rules.map((r) => [r.id, r])),
        getState: () => {
          const s = engine.getState();
          return { variables: s.variables, inventory: s.inventory, reputation: s.reputation };
        },
        applyActions: (actions) => engine.applyActions(actions),
        usedBehaviorIds: engine.usedBehaviorIds,
        currentSceneId: resolveSceneIdFromPassage(engine.getState().currentPassage),
        onAction: handleGameAction,
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
        <h1 style={styles.title}>{readableStoryTitle}</h1>
        <MessageTicker messages={tickerMessages} />
      </header>

      {Object.keys(state.reputation).length > 0 && (
        <aside style={styles.statusPanel}>
          <section>
            <strong style={styles.statusLabel}>声誉</strong>
            <span style={styles.statusValue}>
              {Object.entries(state.reputation)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </span>
          </section>
        </aside>
      )}

      <audio ref={eventBgmRef} loop muted={audioMuted} style={{display: 'none'}} />
      <main style={styles.scroll}>
        {passage && (
          <>
            {introVisible && openingAnimation && (
              <div style={overlayStyles.overlay}>
                <video
                  src={resolveMediaUrl(openingAnimation, gameId)}
                  autoPlay
                  muted
                  playsInline
                  onEnded={handleIntroEnded}
                  onError={handleIntroError}
                  style={overlayStyles.video}
                />
              </div>
            )}
            {eventMediaOverlay && (
              <div style={overlayStyles.overlay}>
                <video
                  src={resolveMediaUrl(eventMediaOverlay.url, gameId)}
                  autoPlay
                  muted
                  playsInline
                  onEnded={() => handleEventMediaEnded(eventMediaOverlay)}
                  onError={() => handleEventMediaError(eventMediaOverlay)}
                  style={overlayStyles.video}
                />
              </div>
            )}
            {!introVisible && eventPhaseReady && (
              <>
                {readablePassageName && (
                  <p style={styles.passageName}>{readablePassageName}</p>
                )}
                <div ref={passageContentRef} className="passage-content">
                  {resolvedImages.length > 0 ? (
                    <div style={styles.sceneStage}>
                      <div
                        className="media-carousel"
                        data-images={JSON.stringify(resolvedImages)}
                        style={styles.sceneImageLayer}
                      >
                        <img src={resolvedImages[0]} alt="" style={styles.sceneImage} />
                      </div>
                      <div style={styles.sceneTextLayer}>
                        <div
                          style={styles.passageTextOverlay}
                          dangerouslySetInnerHTML={{__html: sanitizePassageContent(passage.text)}}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={styles.passageText}
                      dangerouslySetInnerHTML={{__html: sanitizePassageContent(passage.text)}}
                    />
                  )}
                </div>
                <audio ref={bgmRef} loop muted={audioMuted} style={{display: 'none'}} />

            {showActionRow && (
              <section style={styles.behaviorPanel}>
                <div style={styles.actionRow}>
                  <div style={styles.actionRowMain}>
                    {characterIds.length > 0 && (
                      <>
                        <span style={styles.charListLabel}>攀谈：</span>
                        {characterIds.map((cid) => {
                          const c = activeCharacters.find((x) => x.id === cid);
                          const avatarUrl = c?.avatar ? resolveMediaUrl(c.avatar, gameId) : undefined;
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
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    style={styles.journalButton}
                    onClick={() => setJournalOpen(true)}
                  >
                    心迹
                    {journalCount > 0 ? ` (${journalCount})` : ''}
                  </button>
                  {showBackpack && (
                    <button
                      type="button"
                      style={styles.backpackButton}
                      onClick={() => setInventoryOpen(true)}
                    >
                      背包
                    </button>
                  )}
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
                  {getLinkLabel(link)}
                </button>
              ))}
            </nav>
            {navWarning && (
              <p style={styles.navWarning}>
                {navWarning}
              </p>
            )}

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
        character={selectedCharId ? activeCharacters.find((c) => c.id === selectedCharId) ?? null : null}
        characters={activeCharacters}
        gameId={gameId}
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
        gameId={gameId}
        audioMuted={audioMuted}
        onBattleEnd={handleBattleEnd}
        onClose={() => {
          setBattleOpen(false);
          pendingBattleRef.current = null;
          setPendingBattleBehavior(null);
          refresh();
        }}
      />

      <InventoryModal
        open={inventoryOpen}
        inventoryIds={inventoryIds}
        catalog={itemCatalog}
        gameId={gameId}
        onActiveBackgroundMusicChange={setActiveInventoryItemBgm}
        onClose={() => setInventoryOpen(false)}
      />

      <JournalModal
        open={journalOpen}
        groups={journalGroups}
        onClose={() => setJournalOpen(false)}
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  sceneStage: {
    position: 'relative',
    marginBottom: 24,
    minHeight: 420,
    maxHeight: '62vh',
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #2f2f45',
    backgroundColor: '#111',
  },
  sceneImageLayer: {
    position: 'absolute',
    inset: 0,
    marginBottom: 0,
    zIndex: 1,
  },
  sceneImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    filter: 'brightness(0.62) saturate(0.95)',
  },
  sceneTextLayer: {
    position: 'relative',
    zIndex: 2,
    minHeight: 420,
    maxHeight: '62vh',
    overflowY: 'auto',
    padding: '20px 18px 24px',
    background: 'linear-gradient(to bottom, rgba(8,8,16,0.18), rgba(8,8,16,0.36))',
  },
  passageTextOverlay: {
    fontSize: 17,
    lineHeight: 1.7,
    color: '#f3f3f8',
    margin: 0,
    whiteSpace: 'pre-wrap',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    backgroundColor: 'rgba(10, 10, 20, 0.28)',
    borderRadius: 10,
    padding: '12px 14px',
  },
  linkList: {display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16},
  behaviorPanel: {marginTop: 16, paddingTop: 16, borderTop: '1px solid #333'},
  actionRow: {display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12},
  actionRowMain: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: 1, minWidth: 0},
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
  backpackButton: {
    padding: '6px 14px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#c4b5fd',
    fontSize: 14,
    cursor: 'pointer',
    flexShrink: 0,
  },
  journalButton: {
    padding: '6px 14px',
    backgroundColor: '#2f2848',
    border: '1px solid #5a4a94',
    borderRadius: 6,
    color: '#d7ccff',
    fontSize: 14,
    cursor: 'pointer',
    flexShrink: 0,
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
  navWarning: {color: '#f5b041', marginTop: 8, marginBottom: 0, fontSize: 13},
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
