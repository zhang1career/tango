/**
 * 叙事引擎 - 大纲 / 伏笔 / Canon / 生成轨迹
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import {getStoryFmFetchUrl} from '@/config';
import type {StoryFramework} from '@/schema/story-framework';
import {fromPersistedFramework, migrateFramework} from '@/schema/story-framework';
import {
  EMPTY_STORY_CANON,
  normalizeStoryCanon,
  type CanonSceneState,
  type StoryCanon,
} from '@/schema/story-canon';
import {
  EMPTY_STORY_FORESHADOWING,
  normalizeStoryForeshadowing,
  type ForeshadowThread,
  type StoryForeshadowing,
} from '@/schema/story-foreshadowing';
import {
  EMPTY_STORY_OUTLINE,
  normalizeStoryOutline,
  type OutlineBeat,
  type OutlineChapter,
  type StoryOutline,
} from '@/schema/story-outline';
import {
  EMPTY_GENERATION_TRACES,
  normalizeGenerationTraces,
  type StoryGenerationTraces,
} from '@/schema/story-generation-traces';
import {
  fetchGenerationTraces,
  fetchStoryCanon,
  fetchStoryForeshadowing,
  fetchStoryOutline,
  saveStoryCanon,
  saveStoryForeshadowing,
  saveStoryOutline,
} from '@/utils/story-engine-files';
import {formatJsonCompact} from '@/utils/json-format';
import {editorStyles as styles} from '@/styles/editorStyles';

type Tab = 'outline' | 'foreshadowing' | 'canon' | 'traces';

async function loadFw(gameId: string): Promise<StoryFramework | null> {
  const res = await fetch(getStoryFmFetchUrl(gameId));
  if (!res.ok) return null;
  const parsed = (await res.json()) as Record<string, unknown>;
  migrateFramework(parsed as unknown as StoryFramework);
  return fromPersistedFramework(parsed);
}

export function NarrativeEngineEditor() {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const [tab, setTab] = useState<Tab>('outline');
  const [fw, setFw] = useState<StoryFramework | null>(null);
  const [outline, setOutline] = useState<StoryOutline>(EMPTY_STORY_OUTLINE);
  const [foreshadowing, setForeshadowing] = useState<StoryForeshadowing>(EMPTY_STORY_FORESHADOWING);
  const [canon, setCanon] = useState<StoryCanon>(EMPTY_STORY_CANON);
  const [traces, setTraces] = useState<StoryGenerationTraces>(EMPTY_GENERATION_TRACES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    const [f, o, fs, c, t] = await Promise.all([
      loadFw(gameId),
      fetchStoryOutline(gameId),
      fetchStoryForeshadowing(gameId),
      fetchStoryCanon(gameId),
      fetchGenerationTraces(gameId),
    ]);
    setFw(f);
    setOutline(o);
    setForeshadowing(fs);
    setCanon(c);
    setTraces(t);
  }, [gameId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveCurrent = () => {
    void checkAuthForSave(async () => {
      setSaving(true);
      setError(null);
      try {
        if (tab === 'outline') await saveStoryOutline(gameId, outline);
        else if (tab === 'foreshadowing') await saveStoryForeshadowing(gameId, foreshadowing);
        else if (tab === 'canon') await saveStoryCanon(gameId, canon);
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    });
  };

  const syncOutlineFromFm = () => {
    if (!fw) return;
    const chapters: OutlineChapter[] = (fw.chapters ?? []).map((ch) => ({
      chapterId: ch.id,
      title: ch.title,
      theme: ch.theme,
      narrativeGoal: ch.theme ? `推进主题：${ch.theme}` : '',
      beats: (
        ch.availableSceneIds ??
        (ch.sceneEntries ?? []).map((e) => e.sceneId)
      ).map((sid) => ({
        sceneId: sid,
        summary: `场景 ${sid}`,
      })),
    }));
    setOutline({...outline, chapters});
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      style={{...styles.btnSmall, ...(tab === id ? {backgroundColor: '#4a3a6a'} : {})}}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div style={{padding: 16, maxWidth: 960}}>
      <h2 style={{marginTop: 0}}>叙事引擎</h2>
      <p style={{color: '#aaa', fontSize: 13}}>
        真相层：滚动大纲、伏笔池、Canon 快照。生成轨迹只读（DEV 自动写入，不进 zip）。
      </p>
      <div style={{display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap'}}>
        {tabBtn('outline', '滚动大纲')}
        {tabBtn('foreshadowing', '伏笔池')}
        {tabBtn('canon', 'Canon')}
        {tabBtn('traces', '生成轨迹')}
        {tab !== 'traces' && (
          <button type="button" style={styles.btn} onClick={() => void saveCurrent()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        )}
        {tab === 'outline' && (
          <button type="button" style={styles.btnSmall} onClick={syncOutlineFromFm}>
            从 story-fm 同步章节骨架
          </button>
        )}
        <button type="button" style={styles.btnSmall} onClick={() => void reload()}>
          刷新
        </button>
      </div>
      {error && <p style={{color: '#f88'}}>{error}</p>}

      {tab === 'outline' && (
        <div>
          <div style={styles.row}>
            <label style={styles.label}>滚动章数</label>
            <input
              type="number"
              min={1}
              max={20}
              value={outline.rollingHorizonChapters}
              onChange={(e) =>
                setOutline((o) => ({...o, rollingHorizonChapters: Number(e.target.value) || 5}))
              }
              style={{...styles.input, width: 80}}
            />
          </div>
          {(outline.chapters ?? []).map((ch, ci) => (
            <div key={ch.chapterId || ci} style={{border: '1px solid #444', padding: 10, marginBottom: 10}}>
              <input
                value={ch.chapterId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOutline((o) => ({
                    ...o,
                    chapters: o.chapters.map((c, i) => (i === ci ? {...c, chapterId: id} : c)),
                  }));
                }}
                style={styles.input}
                placeholder="chapterId"
              />
              <input
                value={ch.title}
                onChange={(e) =>
                  setOutline((o) => ({
                    ...o,
                    chapters: o.chapters.map((c, i) => (i === ci ? {...c, title: e.target.value} : c)),
                  }))
                }
                style={{...styles.input, marginTop: 6}}
                placeholder="title"
              />
              <textarea
                value={ch.narrativeGoal}
                onChange={(e) =>
                  setOutline((o) => ({
                    ...o,
                    chapters: o.chapters.map((c, i) => (i === ci ? {...c, narrativeGoal: e.target.value} : c)),
                  }))
                }
                style={{...styles.input, ...styles.textarea, marginTop: 6, minHeight: 48}}
                placeholder="narrativeGoal"
              />
              {(ch.beats ?? []).map((beat, bi) => (
                <div key={bi} style={{marginTop: 8, paddingLeft: 8, borderLeft: '2px solid #555'}}>
                  <input
                    value={beat.sceneId ?? ''}
                    onChange={(e) =>
                      setOutline((o) => ({
                        ...o,
                        chapters: o.chapters.map((c, i) =>
                          i === ci
                            ? {
                                ...c,
                                beats: c.beats.map((b, j) =>
                                  j === bi ? {...b, sceneId: e.target.value || undefined} : b
                                ),
                              }
                            : c
                        ),
                      }))
                    }
                    style={styles.input}
                    placeholder="sceneId"
                  />
                  <input
                    value={beat.summary}
                    onChange={(e) =>
                      setOutline((o) => ({
                        ...o,
                        chapters: o.chapters.map((c, i) =>
                          i === ci
                            ? {
                                ...c,
                                beats: c.beats.map((b, j) =>
                                  j === bi ? {...b, summary: e.target.value} : b
                                ),
                              }
                            : c
                        ),
                      }))
                    }
                    style={{...styles.input, marginTop: 4}}
                    placeholder="beat summary"
                  />
                </div>
              ))}
              <button
                type="button"
                style={{...styles.btnSmall, marginTop: 6}}
                onClick={() =>
                  setOutline((o) => ({
                    ...o,
                    chapters: o.chapters.map((c, i) =>
                      i === ci ? {...c, beats: [...c.beats, {summary: ''} as OutlineBeat]} : c
                    ),
                  }))
                }
              >
                + 节拍
              </button>
            </div>
          ))}
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              setOutline((o) => ({
                ...o,
                chapters: [
                  ...o.chapters,
                  {chapterId: `ch_${Date.now()}`, title: '新章', narrativeGoal: '', beats: []},
                ],
              }))
            }
          >
            + 章节
          </button>
        </div>
      )}

      {tab === 'foreshadowing' && (
        <div>
          {(foreshadowing.threads ?? []).map((th, ti) => (
            <div key={th.id || ti} style={{border: '1px solid #444', padding: 10, marginBottom: 8}}>
              <input
                value={th.id}
                onChange={(e) =>
                  setForeshadowing((f) => ({
                    threads: f.threads.map((t, i) => (i === ti ? {...t, id: e.target.value} : t)),
                  }))
                }
                style={styles.input}
                placeholder="id"
              />
              <input
                value={th.title}
                onChange={(e) =>
                  setForeshadowing((f) => ({
                    threads: f.threads.map((t, i) => (i === ti ? {...t, title: e.target.value} : t)),
                  }))
                }
                style={{...styles.input, marginTop: 4}}
                placeholder="title"
              />
              <select
                value={th.status}
                onChange={(e) =>
                  setForeshadowing((f) => ({
                    threads: f.threads.map((t, i) =>
                      i === ti ? {...t, status: e.target.value as ForeshadowThread['status']} : t
                    ),
                  }))
                }
                style={{...styles.input, marginTop: 4}}
              >
                <option value="planned">planned</option>
                <option value="planted">planted</option>
                <option value="resolved">resolved</option>
              </select>
              <input
                value={th.payoffTarget ?? ''}
                onChange={(e) =>
                  setForeshadowing((f) => ({
                    threads: f.threads.map((t, i) =>
                      i === ti ? {...t, payoffTarget: e.target.value || undefined} : t
                    ),
                  }))
                }
                style={{...styles.input, marginTop: 4}}
                placeholder="payoffTarget"
              />
              <textarea
                value={th.notes ?? ''}
                onChange={(e) =>
                  setForeshadowing((f) => ({
                    threads: f.threads.map((t, i) =>
                      i === ti ? {...t, notes: e.target.value || undefined} : t
                    ),
                  }))
                }
                style={{...styles.input, ...styles.textarea, marginTop: 4, minHeight: 40}}
              />
            </div>
          ))}
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              setForeshadowing((f) => ({
                threads: [
                  ...f.threads,
                  {id: `fs_${Date.now()}`, title: '新伏笔', status: 'planned'},
                ],
              }))
            }
          >
            + 伏笔
          </button>
        </div>
      )}

      {tab === 'canon' && (
        <div>
          <textarea
            value={canon.globalNotes ?? ''}
            onChange={(e) => setCanon((c) => ({...c, globalNotes: e.target.value || undefined}))}
            style={{...styles.input, ...styles.textarea, minHeight: 60, width: '100%'}}
            placeholder="globalNotes"
          />
          {Object.entries(canon.scenes).map(([sceneId, st]) => (
            <CanonSceneEditor
              key={sceneId}
              sceneId={sceneId}
              state={st}
              onChange={(next) =>
                setCanon((c) => ({
                  ...c,
                  scenes: {...c.scenes, [sceneId]: next},
                }))
              }
              onRemove={() =>
                setCanon((c) => {
                  const scenes = {...c.scenes};
                  delete scenes[sceneId];
                  return {...c, scenes};
                })
              }
            />
          ))}
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() => {
              const id = prompt('场景 id');
              if (!id?.trim()) return;
              setCanon((c) => ({
                ...c,
                scenes: {...c.scenes, [id.trim()]: {lastUpdatedAt: new Date().toISOString()}},
              }));
            }}
          >
            + 场景快照
          </button>
        </div>
      )}

      {tab === 'traces' && (
        <div style={{fontSize: 12, fontFamily: 'monospace'}}>
          {(traces.entries ?? []).length === 0 ? (
            <p style={{color: '#888'}}>暂无轨迹</p>
          ) : (
            [...traces.entries].reverse().slice(0, 50).map((e) => (
              <details key={e.id} style={{marginBottom: 8, border: '1px solid #333', padding: 8}}>
                <summary>
                  {e.at} · {e.kind} · {e.sceneId}
                  {e.blockIndex != null ? `#${e.blockIndex}` : ''} · {e.model}
                </summary>
                <pre style={{whiteSpace: 'pre-wrap', color: '#ccc'}}>
                  {formatJsonCompact(e.phases)}
                </pre>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CanonSceneEditor({
  sceneId,
  state,
  onChange,
  onRemove,
}: {
  sceneId: string;
  state: CanonSceneState;
  onChange: (s: CanonSceneState) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{border: '1px solid #444', padding: 10, marginTop: 10}}>
      <div style={{display: 'flex', justifyContent: 'space-between'}}>
        <strong>{sceneId}</strong>
        <button type="button" style={styles.btnIcon} onClick={onRemove}>
          ×
        </button>
      </div>
      <textarea
        value={(state.facts ?? []).join('\n')}
        onChange={(e) =>
          onChange({
            ...state,
            facts: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
          })
        }
        style={{...styles.input, ...styles.textarea, marginTop: 6, minHeight: 48, width: '100%'}}
        placeholder="facts（每行一条）"
      />
      <textarea
        value={(state.openQuestions ?? []).join('\n')}
        onChange={(e) =>
          onChange({
            ...state,
            openQuestions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
          })
        }
        style={{...styles.input, ...styles.textarea, marginTop: 6, minHeight: 40, width: '100%'}}
        placeholder="openQuestions"
      />
    </div>
  );
}
