/**
 * 场景页：与本场景相关的已埋设伏笔 / Canon 快照（只读）
 */

import React from 'react';
import {canonSceneForContext, type StoryCanon} from '@/schema/story-canon';
import type {StoryForeshadowing} from '@/schema/story-foreshadowing';
import type {GameScene} from '@/schema/game-scene';
import {foreshadowThreadsForScene} from '@/schema/story-foreshadowing';

const sectionTitle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  color: '#d1d5db',
  marginBottom: 8,
  marginTop: 16,
};

const card: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: 6,
  padding: 10,
  marginBottom: 8,
  fontSize: 12,
};

const roleBadgeStyle: Record<string, React.CSSProperties> = {
  plant: {color: '#90caf9', backgroundColor: 'rgba(144, 202, 249, 0.15)'},
  echo: {color: '#c4b5fd', backgroundColor: 'rgba(196, 181, 253, 0.15)'},
  payoff: {color: '#86efac', backgroundColor: 'rgba(134, 239, 172, 0.15)'},
};

export function SceneNarrativePanel({
  sceneId,
  scenes,
  foreshadowing,
  canon,
  characterIds = [],
}: {
  sceneId: string;
  scenes: GameScene[];
  foreshadowing: StoryForeshadowing;
  canon: StoryCanon;
  characterIds?: Array<{id: string; name: string}>;
}) {
  const threads = foreshadowThreadsForScene(foreshadowing.threads ?? [], sceneId);
  const canonState = canonSceneForContext(canon, sceneId);
  const showCanon = !!canonState;

  if (!threads.length && !showCanon) return null;

  const sceneLabel = (id: string) => scenes.find((s) => s.id === id)?.name ?? id;
  const characterLabel = (id: string) => characterIds.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      {threads.length > 0 && (
        <>
          <div style={sectionTitle}>相关伏笔（只读）</div>
          {threads.map((t) => (
            <div key={t.id} style={card}>
              <div style={{fontWeight: 600}}>
                {t.title}{' '}
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '1px 6px',
                    borderRadius: 4,
                    ...roleBadgeStyle[t.role],
                  }}
                >
                  {t.roleLabel}
                </span>
              </div>
              {t.role === 'plant' && t.plantedBlockIndex !== undefined && (
                <div style={{color: '#666', marginTop: 4}}>埋设块：AI 块 #{t.plantedBlockIndex + 1}</div>
              )}
              {t.setup && <div style={{color: '#aaa', marginTop: 4}}>埋设要点：{t.setup}</div>}
              {t.payoff && <div style={{color: '#aaa', marginTop: 4}}>回收要点：{t.payoff}</div>}
              {t.role !== 'plant' && t.plantedSceneId && (
                <div style={{color: '#666', marginTop: 4}}>埋设于：{sceneLabel(t.plantedSceneId)}</div>
              )}
            </div>
          ))}
        </>
      )}
      {showCanon && canonState && (
        <>
          <div style={sectionTitle}>Canon 快照（只读）</div>
          <div style={card}>
            {canonState.summary && <div>{canonState.summary}</div>}
            {(canonState.facts ?? []).length > 0 && (
              <ul style={{margin: '6px 0 0', paddingLeft: 18, color: '#bbb'}}>
                {canonState.facts!.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            {(canonState.openQuestions ?? []).length > 0 && (
              <>
                <div style={{color: '#9ca3af', marginTop: 8, fontSize: 11}}>未解问题</div>
                <ul style={{margin: '4px 0 0', paddingLeft: 18, color: '#bbb'}}>
                  {canonState.openQuestions!.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            {Object.entries(canonState.characterStates ?? {}).map(([cid, cs]) => (
              <div key={cid} style={{marginTop: 8, color: '#aaa'}}>
                <span style={{fontWeight: 600, color: '#d1d5db'}}>{characterLabel(cid)}</span>
                {cs.location && <span> · 位置：{cs.location}</span>}
                {cs.emotion && <span> · 情绪：{cs.emotion}</span>}
                {(cs.knows ?? []).length > 0 && (
                  <ul style={{margin: '4px 0 0', paddingLeft: 18, color: '#bbb'}}>
                    {cs.knows!.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {canonState.lastUpdatedAt && (
              <div style={{color: '#666', marginTop: 8, fontSize: 11}}>
                更新于：{canonState.lastUpdatedAt}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
