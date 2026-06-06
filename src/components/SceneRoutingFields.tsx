/**
 * 场景主线/支线路由展示与 branchOptions 编辑
 */

import React from 'react';
import type {PassageLink} from '@/types';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene, SceneBranchOption} from '../schema/game-scene';
import {editorStyles as styles} from '../styles/editorStyles';
import {
  buildSceneChapterContextIndex,
  getSceneRoutingView,
} from '../utils/scene-routing';
import {stripPassageLinkPrefix} from '../utils/scene-routing-sync';
import {MultiSelectField} from './ui/MultiSelectField';

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  margin: '0 0 10px',
  lineHeight: 1.5,
};

const warnStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ffb74d',
  margin: '8px 0 0',
  lineHeight: 1.5,
  padding: '8px 10px',
  backgroundColor: 'rgba(255,193,7,0.1)',
  borderRadius: 6,
  border: '1px solid rgba(255,193,7,0.35)',
};

const cardStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  backgroundColor: '#1e1e32',
  border: '1px solid #333',
  borderRadius: 8,
};

const readOnlyLine: React.CSSProperties = {
  fontSize: 13,
  color: '#e8e8e8',
  marginBottom: 6,
};

function newBranchOptionId(): string {
  return `br_${Date.now().toString(36).slice(-6)}`;
}

function formatLinkSummary(links: PassageLink[]): string {
  if (links.length === 0) return '（无链接）';
  return links
    .map((l) => `「${stripPassageLinkPrefix(l.displayText)}」→ ${l.passageName}`)
    .join('；');
}

function SceneRoutingSummary({
  fw,
  scene,
  routingStale,
  expectedLinks,
  actualLinks,
  onSyncRouting,
  syncingRouting,
}: {
  fw: StoryFramework;
  scene: GameScene;
  routingStale?: boolean;
  expectedLinks?: PassageLink[];
  actualLinks?: PassageLink[];
  onSyncRouting?: () => void;
  syncingRouting?: boolean;
}) {
  const routing = getSceneRoutingView(fw, scene);
  if (!routing.inChapter) {
    return (
      <p style={hintStyle}>
        未在任何章节的「场景」列表中；主线下一跳与支线链接需在「剧情」页将本场景加入章节后才会生效。
      </p>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{...styles.label, marginBottom: 8}}>路由（只读，由剧情章内顺序推导）</div>
      <div style={readOnlyLine}>
        所属章节：<strong>{routing.chapterTitle}</strong>
      </div>
      {routing.isBranchScene && routing.branchOwner ? (
        <>
          <div style={readOnlyLine}>类型：支线场景</div>
          <div style={readOnlyLine}>
            归属主线：<strong>{routing.branchOwner.rootSceneName}</strong>（{routing.branchOwner.rootSceneId}）
          </div>
          <div style={readOnlyLine}>
            末端返回目标 passage：<strong>{routing.branchOwner.rootSceneName}</strong>
          </div>
        </>
      ) : (
        <>
          <div style={readOnlyLine}>
            类型：主线场景
            {routing.mainlinePosition
              ? `（本章主线 ${routing.mainlinePosition.index}/${routing.mainlinePosition.total}）`
              : ''}
          </div>
          {routing.hasNextMainline && routing.nextMainline ? (
            <div style={readOnlyLine}>
              章内下一主线：<strong>{routing.nextMainline.name}</strong>（{routing.nextMainline.sceneId}）
              {scene.mainlineLinkDisplayText?.trim()
                ? ` · 出口文案「${scene.mainlineLinkDisplayText.trim()}」`
                : ' · 出口文案默认「继续」'}
            </div>
          ) : routing.crossChapterExit ? (
            <div style={readOnlyLine}>
              跨章出口：<strong>{routing.crossChapterExit.displayText}</strong> →{' '}
              {routing.crossChapterExit.targetSceneName}（{routing.crossChapterExit.targetSceneId}）
              <span style={{color: '#9ca3af'}}>
                {' '}
                · 地图边 {routing.crossChapterExit.mapEdgeFrom}→{routing.crossChapterExit.mapEdgeTo}
              </span>
            </div>
          ) : (
            <div style={readOnlyLine}>下一主线：无（终章末或无跨章配置）</div>
          )}
        </>
      )}
      {routingStale && expectedLinks ? (
        <div style={warnStyle}>
          <div style={{fontWeight: 600, marginBottom: 4}}>story.tw 路由链接与框架不一致</div>
          <div>期望：{formatLinkSummary(expectedLinks)}</div>
          {actualLinks && actualLinks.length > 0 ? (
            <div style={{marginTop: 4}}>当前：{formatLinkSummary(actualLinks)}</div>
          ) : (
            <div style={{marginTop: 4}}>当前：story.tw 中尚未写入或 passage 不存在</div>
          )}
          {onSyncRouting ? (
            <button
              type="button"
              style={{...styles.btnSmall, marginTop: 8}}
              disabled={syncingRouting}
              onClick={onSyncRouting}
            >
              {syncingRouting ? '同步中…' : '仅同步链接（不改正文）'}
            </button>
          ) : null}
        </div>
      ) : null}
      <p style={{...hintStyle, marginBottom: 0, marginTop: 8}}>
        章内主线顺序 =「剧情」页本章场景列表顺序，排除被 branchSceneIds 引用的支线场景。跨章出口由章节边界与地图边推导；调整后在剧情页「同步路由链接」或保存剧情框架时自动修复。
      </p>
    </div>
  );
}

function BranchOptionCard({
  option,
  index,
  editable,
  candidateScenes,
  rootSceneName,
  onChange,
  onRemove,
}: {
  option: SceneBranchOption;
  index: number;
  editable: boolean;
  candidateScenes: Array<{id: string; name: string}>;
  rootSceneName: string;
  onChange: (fn: (o: SceneBranchOption) => SceneBranchOption) => void;
  onRemove: () => void;
}) {
  const branchIds = option.branchSceneIds ?? [];
  const needContinue = branchIds.length > 1;
  const continueTexts = option.continueDisplayTexts ?? [];

  return (
    <div style={{...cardStyle, marginTop: 8}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
        <span style={{fontSize: 13, color: '#a78bfa'}}>支线选项 {index + 1}</span>
        {editable && (
          <button type="button" style={styles.btnSmall} onClick={onRemove}>
            删除
          </button>
        )}
      </div>
      <label style={styles.label}>选项 id</label>
      {editable ? (
        <input
          value={option.id}
          onChange={(e) => onChange((o) => ({...o, id: e.target.value.trim()}))}
          style={{...styles.input, marginBottom: 8}}
        />
      ) : (
        <div style={styles.readOnlyValue}>{option.id}</div>
      )}
      <label style={styles.label}>支线入口文案（displayText）</label>
      {editable ? (
        <input
          value={option.displayText}
          onChange={(e) => onChange((o) => ({...o, displayText: e.target.value}))}
          style={{...styles.input, marginBottom: 8}}
        />
      ) : (
        <div style={styles.readOnlyValue}>{option.displayText}</div>
      )}
      <label style={styles.label}>失败结局说明（failureEnding）</label>
      {editable ? (
        <textarea
          value={option.failureEnding}
          onChange={(e) => onChange((o) => ({...o, failureEnding: e.target.value}))}
          style={{...styles.input, ...styles.textarea, minHeight: 56, marginBottom: 8}}
        />
      ) : (
        <div style={styles.readOnlyValue}>{option.failureEnding}</div>
      )}
      {editable ? (
        candidateScenes.length === 0 ? (
          <p style={hintStyle}>请先在剧情页将支线场景加入本章。</p>
        ) : (
          <MultiSelectField
            label="支线路径场景（branchSceneIds，1–2 个）"
            hint="须已在本章场景列表中；顺序即支线路径"
            options={candidateScenes.map((c) => ({id: c.id, name: `${c.name}（${c.id}）`}))}
            value={branchIds}
            maxSelection={2}
            addPlaceholder="添加支线场景…"
            emptyHint="（未选择支线场景）"
            onChange={(ids) =>
              onChange((o) => ({
                ...o,
                branchSceneIds: ids,
                continueDisplayTexts:
                  ids.length > 1 ? (o.continueDisplayTexts ?? []).slice(0, ids.length - 1) : undefined,
              }))
            }
          />
        )
      ) : (
        <>
          <label style={styles.label}>支线路径场景（branchSceneIds）</label>
          <div style={styles.readOnlyValue}>
            {branchIds.length ? branchIds.join(' → ') : '-'}
          </div>
        </>
      )}
      {needContinue && (
        <>
          <label style={styles.label}>支线内继续文案（continueDisplayTexts[0]）</label>
          {editable ? (
            <input
              value={continueTexts[0] ?? ''}
              onChange={(e) =>
                onChange((o) => ({
                  ...o,
                  continueDisplayTexts: [e.target.value],
                }))
              }
              style={{...styles.input, marginBottom: 8}}
              placeholder="默认「继续」"
            />
          ) : (
            <div style={styles.readOnlyValue}>{continueTexts[0] ?? '继续'}</div>
          )}
        </>
      )}
      <label style={styles.label}>返回主线文案（returnDisplayText）</label>
      {editable ? (
        <input
          value={option.returnDisplayText ?? ''}
          onChange={(e) =>
            onChange((o) => ({
              ...o,
              returnDisplayText: e.target.value.trim() || undefined,
            }))
          }
          style={{...styles.input, marginBottom: 8}}
          placeholder={`默认「返回主线」；链接目标为「${rootSceneName}」`}
        />
      ) : (
        <div style={styles.readOnlyValue}>
          {option.returnDisplayText?.trim() || '返回主线'} → {rootSceneName}
        </div>
      )}
      <label style={styles.label}>入口条件（condition，可选）</label>
      {editable ? (
        <input
          value={option.condition ?? ''}
          onChange={(e) =>
            onChange((o) => ({
              ...o,
              condition: e.target.value.trim() || undefined,
            }))
          }
          style={styles.input}
          placeholder="$court >= 0"
        />
      ) : (
        <div style={styles.readOnlyValue}>{option.condition ?? '-'}</div>
      )}
    </div>
  );
}

export function SceneRoutingFields({
  fw,
  scene,
  editable,
  onUpdate,
  routingStale,
  expectedLinks,
  actualLinks,
  onSyncRouting,
  syncingRouting,
}: {
  fw?: StoryFramework;
  scene: GameScene;
  editable: boolean;
  onUpdate?: (fn: (s: GameScene) => GameScene) => void;
  routingStale?: boolean;
  expectedLinks?: PassageLink[];
  actualLinks?: PassageLink[];
  onSyncRouting?: () => void | Promise<void>;
  syncingRouting?: boolean;
}) {
  if (!fw) {
    return (
      <p style={hintStyle}>加载剧情框架后可查看路由与编辑支线。</p>
    );
  }

  const routing = getSceneRoutingView(fw, scene);
  const ctx = buildSceneChapterContextIndex(fw).get(scene.id);
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const candidateScenes = (ctx?.sceneIdsInChapter ?? [])
    .filter((id) => id !== scene.id)
    .map((id) => {
      const s = sceneMap.get(id);
      return {id, name: s?.name ?? id};
    });

  const updateOptions = (fn: (opts: SceneBranchOption[]) => SceneBranchOption[]) => {
    if (!onUpdate) return;
    onUpdate((s) => {
      const next = fn(s.branchOptions ?? []);
      return {...s, branchOptions: next.length ? next : undefined};
    });
  };

  return (
    <div style={{marginTop: 8, marginBottom: 16}}>
      <SceneRoutingSummary
        fw={fw}
        scene={scene}
        routingStale={routingStale}
        expectedLinks={expectedLinks}
        actualLinks={actualLinks}
        onSyncRouting={onSyncRouting ? () => void onSyncRouting() : undefined}
        syncingRouting={syncingRouting}
      />

      {!routing.isBranchScene && (
        <div>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
            <span style={styles.label}>支线选项（branchOptions）</span>
            {editable && onUpdate && (
              <button
                type="button"
                style={styles.btnSmall}
                onClick={() =>
                  updateOptions((opts) => [
                    ...opts,
                    {
                      id: newBranchOptionId(),
                      displayText: '',
                      failureEnding: '',
                      branchSceneIds: [],
                      returnDisplayText: `回到${scene.name}`,
                    },
                  ])
                }
              >
                + 添加支线
              </button>
            )}
          </div>
          <p style={hintStyle}>
            仅主线根场景填写。支线场景须在剧情页加入本章，且 scene.ruleIds 含 rule_0001（onlyOnce）；根场景不可含
            rule_0001。保存场景或剧情框架后，请同步路由链接（无需重跑 AI 汇编）。
          </p>
          {(scene.branchOptions ?? []).length === 0 ? (
            <div style={styles.readOnlyValue}>（无支线）</div>
          ) : (
            (scene.branchOptions ?? []).map((opt, i) => (
              <BranchOptionCard
                key={opt.id || i}
                option={opt}
                index={i}
                editable={editable && !!onUpdate}
                candidateScenes={candidateScenes}
                rootSceneName={scene.name}
                onChange={(fn) =>
                  updateOptions((opts) => opts.map((o, j) => (j === i ? fn(o) : o)))
                }
                onRemove={() => updateOptions((opts) => opts.filter((_, j) => j !== i))}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
