/**
 * 文字冒险游戏 - 入口
 * 支持 Twee 格式
 * 配置 GAME_CONTENT_PATH 或 VITE_GAME_CONTENT_PATH（如 assets/story.tw）
 */

import React, {useCallback, useState} from 'react';
import {GameScreen} from './components/GameScreen';
import {FrameworkEditor} from './components/FrameworkEditor';
import {MapEditor} from './components/MapEditor';
import {CharacterEditor} from './components/CharacterEditor';
import {EventEditor} from './components/EventEditor';
import {MetadataEditor} from './components/MetadataEditor';
import {ItemsEditorPage} from './components/ItemsEditorPage';
import {SceneEditor} from './components/SceneEditor';
import {RuleEditor} from './components/RuleEditor';
import {getAppMode, getContentPath} from './config';
import type {StoryFramework} from './schema/story-framework';

async function fetchContent(path: string): Promise<string> {
  const p = path || getContentPath();
  if (!p) {
    throw new Error('请配置 GAME_CONTENT_PATH 或 VITE_GAME_CONTENT_PATH（如 assets/story.tw）');
  }
  if (p.startsWith('http://') || p.startsWith('https://')) {
    const res = await fetch(p);
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    return res.text();
  }
  // 开发环境：通过 API 读取项目内文件；生产环境：fetch 静态资源
  const url = import.meta.env.DEV ? '/api/game-content' : (p.startsWith('/') ? p : `/${p}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败: ${res.status} ${p}`);
  return res.text();
}

const DEFAULT_FRAMEWORK: StoryFramework = {
  title: '未命名故事',
  chapters: [{id: 'ch0', title: '第一章', sceneEntries: []}],
};

const isProd = getAppMode() === 'prod';

export default function App() {
  const [mode, setMode] = useState<'game' | 'timeline' | 'scenes' | 'map' | 'characters' | 'events' | 'items' | 'rules' | 'metadata'>('game');
  const [fw, setFw] = useState<StoryFramework>(DEFAULT_FRAMEWORK);
  const updateFw = useCallback((fn: (d: StoryFramework) => StoryFramework) => {
    setFw((prev) => fn(prev));
  }, []);

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#1a1a2e'}}>
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
              style={{...navStyles.tab, ...(mode === 'metadata' ? navStyles.tabActive : {})}}
              onClick={() => setMode('metadata')}
            >
              元信息
            </button>
          </>
        )}
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
