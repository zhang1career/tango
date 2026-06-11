/**
 * 章节页：与本章相关的伏笔 / Canon（只读）
 */

import React from 'react';
import type {FrameworkChapter} from '@/schema/story-framework';
import type {StoryCanon} from '@/schema/story-canon';
import type {StoryForeshadowing} from '@/schema/story-foreshadowing';
import type {GameScene} from '@/schema/game-scene';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import {foreshadowStatusLabel, foreshadowStatusStyle, foreshadowThreadsForChapter} from '@/schema/story-foreshadowing';

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

export function ChapterNarrativePanel({
  ch,
  scenes,
  foreshadowing,
  canon,
}: {
  ch: FrameworkChapter;
  scenes: GameScene[];
  foreshadowing: StoryForeshadowing;
  canon: StoryCanon;
}) {
  const pool = new Set(getChapterAvailableSceneIds(ch));
  const sceneLabel = (id: string) => scenes.find((s) => s.id === id)?.name ?? id;

  const threads = foreshadowThreadsForChapter(foreshadowing.threads ?? [], pool);

  const canonEntries = Object.entries(canon.scenes ?? {}).filter(([sid]) => pool.has(sid));

  if (!threads.length && !canonEntries.length) {
    return (
      <p style={{fontSize: 12, color: '#666', marginTop: 16}}>
        本章暂无相关伏笔或 Canon 快照（汇编后会自动写入 Canon）。
      </p>
    );
  }

  return (
    <div>
      {threads.length > 0 && (
        <>
          <div style={sectionTitle}>相关伏笔（只读）</div>
          {threads.slice(0, 12).map((t) => (
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
                    ...foreshadowStatusStyle(t.status),
                  }}
                >
                  {foreshadowStatusLabel(t.status)}
                </span>
              </div>
              {t.setup && <div style={{color: '#aaa', marginTop: 4}}>埋设：{t.setup}</div>}
              {t.payoff && <div style={{color: '#aaa', marginTop: 4}}>回收：{t.payoff}</div>}
              {t.plantedIn?.sceneId && (
                <div style={{color: '#666', marginTop: 4}}>埋设于：{sceneLabel(t.plantedIn.sceneId)}</div>
              )}
            </div>
          ))}
        </>
      )}
      {canonEntries.length > 0 && (
        <>
          <div style={sectionTitle}>Canon 快照（只读）</div>
          {canonEntries.map(([sid, st]) => (
            <div key={sid} style={card}>
              <div style={{fontWeight: 600}}>{sceneLabel(sid)}</div>
              {st.summary && <div style={{marginTop: 4}}>{st.summary}</div>}
              {(st.facts ?? []).length > 0 && (
                <ul style={{margin: '6px 0 0', paddingLeft: 18, color: '#bbb'}}>
                  {st.facts!.slice(0, 6).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
