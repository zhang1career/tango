/**
 * 文字冒险游戏 - 入口
 * 支持 Twee 格式、多游戏（gameId 隔离）
 * 游戏数据位于 GAMES_BASE_PATH/{gameId}/（默认 assets/games）
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {GameScreen} from './components/GameScreen';
import {FrameworkEditor} from './components/FrameworkEditor';
import {MapEditor} from './components/MapEditor';
import {CharacterEditor} from './components/CharacterEditor';
import {EventEditor} from './components/EventEditor';
import {MetadataEditor} from './components/MetadataEditor';
import {ItemsEditorPage} from './components/ItemsEditorPage';
import {SceneEditor} from './components/SceneEditor';
import {RuleEditor} from './components/RuleEditor';
import {FeaturePanelEditor} from './components/FeaturePanelEditor';
import {NotificationToast} from './components/NotificationToast';
import {LoginPage} from './components/LoginPage';
import {useGameId} from './context/GameIdContext';
import {useNotification} from './context/NotificationContext';
import {AuthProvider, useAuth} from './context/AuthContext';
import {getAppMode, getContentPath, getGameContentUrl, getStoryFmFetchUrl, DEFAULT_GAME_ID} from './config';
import {fromPersistedFramework, migrateFramework} from './schema/story-framework';
import type {StoryFramework} from './schema/story-framework';

const DEFAULT_FRAMEWORK: StoryFramework = {
  title: '未命名故事',
  chapters: [{id: 'ch0', title: '第一章', sceneEntries: []}],
};

const isProd = getAppMode() === 'prod';

function UserNavButton() {
  const {user, logout} = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  if (user) {
    return (
      <div ref={ref} style={{position: 'relative'}}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: '4px 12px',
            backgroundColor: '#252540',
            color: '#a78bfa',
            border: '1px solid #333',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {user} ▾
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              minWidth: 100,
              padding: 4,
              backgroundColor: '#252540',
              border: '1px solid #333',
              borderRadius: 6,
              zIndex: 100,
            }}
          >
            <button
              type="button"
              onClick={() => { logout(); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#e8e8e8',
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              注销
            </button>
          </div>
        )}
      </div>
    );
  }
  return null;
}

async function fetchContentForGame(gameId: string, pathOverride?: string): Promise<string> {
  const p = pathOverride || getContentPath(gameId);
  if (!p) throw new Error('游戏内容路径为空');
  if (p.startsWith('http://') || p.startsWith('https://')) {
    const res = await fetch(p);
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    return res.text();
  }
  const url = import.meta.env.DEV ? getGameContentUrl(gameId) : (p.startsWith('/') ? p : `/${p}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败: ${res.status} ${p}`);
  return res.text();
}

export default function App() {
  const {gameId, setGameId, gameIds} = useGameId();
  const {addNotification} = useNotification();
  const [mode, setMode] = useState<'game' | 'timeline' | 'scenes' | 'map' | 'characters' | 'events' | 'items' | 'rules' | 'features' | 'metadata'>('game');
  const [fw, setFw] = useState<StoryFramework>(DEFAULT_FRAMEWORK);
  const updateFw = useCallback((fn: (d: StoryFramework) => StoryFramework) => {
    setFw((prev) => fn(prev));
  }, []);

  const loadStoryFm = useCallback(
    async (targetGameId: string) => {
      const url = getStoryFmFetchUrl(targetGameId);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) {
            setGameId(DEFAULT_GAME_ID);
            addNotification('error', `剧情文件不存在：${targetGameId}/story-fm.json`);
          } else {
            addNotification('error', `加载失败: ${res.status}`);
          }
          return;
        }
        const parsed = (await res.json()) as Record<string, unknown>;
        if (!parsed.title) parsed.title = '未命名故事';
        if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
          parsed.chapters = [{id: 'ch0', title: '第一章', sceneEntries: []}];
        }
        migrateFramework(parsed as unknown as StoryFramework);
        updateFw(() => fromPersistedFramework(parsed));
        setGameId(targetGameId);
      } catch (e) {
        addNotification('error', (e as Error).message || '加载剧情失败');
      }
    },
    [setGameId, updateFw, addNotification]
  );

  useEffect(() => {
    if (mode === 'timeline') loadStoryFm(gameId);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- load on timeline enter only

  const fetchContent = useCallback(
    (path?: string) => fetchContentForGame(gameId, path),
    [gameId]
  );

  const handleGameSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      loadStoryFm(e.target.value);
    },
    [loadStoryFm]
  );

  return (
    <AuthProvider
      getReturnTo={() => ({ mode, gameId })}
      onUnauthorized={() => addNotification('error', '未授权操作')}
    >
      <AppBody
        mode={mode}
        setMode={setMode}
        gameId={gameId}
        gameIds={gameIds}
        handleGameSelect={handleGameSelect}
        fw={fw}
        updateFw={updateFw}
        fetchContent={fetchContent}
        loadStoryFm={loadStoryFm}
      />
    </AuthProvider>
  );
}

type AppBodyProps = {
  mode: string;
  setMode: (m: 'game' | 'timeline' | 'scenes' | 'map' | 'characters' | 'events' | 'items' | 'rules' | 'features' | 'metadata') => void;
  gameId: string;
  gameIds: string[];
  handleGameSelect: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  fetchContent: (path?: string) => Promise<string>;
  loadStoryFm: (targetGameId: string) => Promise<void>;
};

type ModeType = 'game' | 'timeline' | 'scenes' | 'map' | 'characters' | 'events' | 'items' | 'rules' | 'features' | 'metadata';

function AppBody({
  mode,
  setMode,
  gameId,
  gameIds,
  handleGameSelect,
  fw,
  updateFw,
  fetchContent,
  loadStoryFm,
}: AppBodyProps) {
  const {user, returnTo, clearReturnTo, login} = useAuth();
  const handleLoginSuccess = useCallback(() => {
    if (returnTo) {
      setMode(returnTo.mode as ModeType);
      loadStoryFm(returnTo.gameId);
      clearReturnTo();
    }
  }, [returnTo, clearReturnTo, setMode, loadStoryFm]);

  if (!user) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#1a1a2e'}}>
        <NotificationToast />
        <LoginPage login={login} onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#1a1a2e'}}>
      <NotificationToast />
      <nav style={navStyles.bar}>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'game' ? navStyles.tabActive : {})}}
          onClick={() => setMode('game')}
        >
          游戏
        </button>
        {!isProd && (
          <>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'timeline' ? navStyles.tabActive : {})}}
              onClick={() => setMode('timeline')}
            >
              剧情
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'scenes' ? navStyles.tabActive : {})}}
              onClick={() => setMode('scenes')}
            >
              场景
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'map' ? navStyles.tabActive : {})}}
              onClick={() => setMode('map')}
            >
              地图
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'characters' ? navStyles.tabActive : {})}}
              onClick={() => setMode('characters')}
            >
              人物
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'events' ? navStyles.tabActive : {})}}
              onClick={() => setMode('events')}
            >
              事件
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'items' ? navStyles.tabActive : {})}}
              onClick={() => setMode('items')}
            >
              物品
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'rules' ? navStyles.tabActive : {})}}
              onClick={() => setMode('rules')}
            >
              规则
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'features' ? navStyles.tabActive : {})}}
              onClick={() => setMode('features')}
            >
              功能板块
            </button>
            <button
              type="button"
              style={{...navStyles.tab, ...(mode === 'metadata' ? navStyles.tabActive : {})}}
              onClick={() => setMode('metadata')}
            >
              元信息
            </button>
          </>
        )}
        <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12}}>
          <select
            value={gameIds.includes(gameId) ? gameId : (gameIds[0] ?? DEFAULT_GAME_ID)}
            onChange={handleGameSelect}
            style={{
              padding: '4px 10px',
              backgroundColor: '#252540',
              color: '#a78bfa',
              border: '1px solid #333',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {gameIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <UserNavButton />
        </div>
      </nav>
      {(mode === 'game' || isProd) ? (
        <GameScreen fetchContent={fetchContent}/>
      ) : mode === 'timeline' ? (
        <FrameworkEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'scenes' ? (
        <SceneEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'map' ? (
        <MapEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'events' ? (
        <EventEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'items' ? (
        <ItemsEditorPage fw={fw} updateFw={updateFw}/>
      ) : mode === 'rules' ? (
        <RuleEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'features' ? (
        <FeaturePanelEditor/>
      ) : mode === 'metadata' ? (
        <MetadataEditor fw={fw} updateFw={updateFw}/>
      ) : (
        <CharacterEditor fw={fw} updateFw={updateFw}/>
      )}
    </div>
  );
}

const navStyles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: 0,
    padding: '8px 16px',
    backgroundColor: '#16162a',
    borderBottom: '1px solid #333',
  },
  tab: {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 14,
    cursor: 'pointer',
    borderRadius: 6,
  },
  tabActive: {
    color: '#a78bfa',
    backgroundColor: '#252540',
  },
};
