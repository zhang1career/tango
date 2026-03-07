/**
 * 文字冒险游戏 - 入口
 * 支持 Twee 格式
 * 通过 .env 配置 VITE_GAME_CONTENT_PATH
 */

import React, { useState, useCallback } from 'react';
import { GameScreen } from './components/GameScreen';
import { FrameworkEditor } from './components/FrameworkEditor';
import { MapEditor } from './components/MapEditor';
import { CharacterEditor } from './components/CharacterEditor';
import { EventEditor } from './components/EventEditor';
import { MetadataEditor } from './components/MetadataEditor';
import { ItemsEditorPage } from './components/ItemsEditorPage';
import type { StoryFramework } from './schema/story-framework';
import type { GameMap } from './schema/game-map';
import exampleFramework from '../assets/story-framework.example.json';
import storyMaps from '../assets/story-maps.json';

async function fetchContent(path: string): Promise<string> {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    return res.text();
  }
  const { default: story } = await import('./data/story.tw');
  return story;
}

const DEFAULT_FRAMEWORK: StoryFramework = {
  ...(exampleFramework as StoryFramework),
  maps: (storyMaps as GameMap[]).length > 0 ? (storyMaps as GameMap[]) : (exampleFramework as StoryFramework).maps,
};

export default function App() {
  const [mode, setMode] = useState<'game' | 'timeline' | 'map' | 'characters' | 'events' | 'metadata' | 'items'>('game');
  const [fw, setFw] = useState<StoryFramework>(DEFAULT_FRAMEWORK);
  const updateFw = useCallback((fn: (d: StoryFramework) => StoryFramework) => {
    setFw((prev) => fn(prev));
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1a1a2e' }}>
      <nav style={navStyles.bar}>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'game' ? navStyles.tabActive : {})}}
          onClick={() => setMode('game')}
        >
          游戏
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'timeline' ? navStyles.tabActive : {})}}
          onClick={() => setMode('timeline')}
        >
          编辑时间线
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'map' ? navStyles.tabActive : {})}}
          onClick={() => setMode('map')}
        >
          编辑地图
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'characters' ? navStyles.tabActive : {})}}
          onClick={() => setMode('characters')}
        >
          编辑人物
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'events' ? navStyles.tabActive : {})}}
          onClick={() => setMode('events')}
        >
          编辑事件
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'items' ? navStyles.tabActive : {})}}
          onClick={() => setMode('items')}
        >
          编辑物品
        </button>
        <button
          type="button"
          style={{...navStyles.tab, ...(mode === 'metadata' ? navStyles.tabActive : {})}}
          onClick={() => setMode('metadata')}
        >
          编辑元信息
        </button>
      </nav>
      {mode === 'game' ? (
        <GameScreen fetchContent={fetchContent}/>
      ) : mode === 'timeline' ? (
        <FrameworkEditor fw={fw} updateFw={updateFw}/>
      ) : mode === 'map' ? (
        <MapEditor fw={fw} updateFw={updateFw} />
      ) : mode === 'events' ? (
        <EventEditor fw={fw} updateFw={updateFw} />
      ) : mode === 'metadata' ? (
        <MetadataEditor fw={fw} updateFw={updateFw} />
      ) : mode === 'items' ? (
        <ItemsEditorPage fw={fw} updateFw={updateFw} />
      ) : (
        <CharacterEditor fw={fw} updateFw={updateFw} />
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
