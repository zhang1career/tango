/**
 * 场景路由只读摘要（路由在「章节」页编辑）
 */

import React from 'react';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {getSceneRoutingView} from '../utils/scene-routing';
import type {PassageLink} from '@/types';
import {stripPassageLinkPrefix} from '../utils/scene-routing-sync';

const styles: Record<string, React.CSSProperties> = {
  box: {fontSize: 13, color: '#bbb', lineHeight: 1.5},
  label: {fontSize: 12, color: '#9ca3af', marginBottom: 4},
  readOnlyValue: {padding: '6px 0'},
  stale: {marginTop: 8, fontSize: 12, color: '#ffb74d'},
};

function formatLinks(links: PassageLink[]): string {
  if (!links.length) return '（无）';
  return links
    .map((l) => `${stripPassageLinkPrefix(l.displayText)} → ${l.passageName}`)
    .join('；');
}

export function SceneRoutingFields({
  fw,
  scene,
  routingStale,
  expectedLinks,
}: {
  fw?: StoryFramework;
  scene: GameScene;
  routingStale?: boolean;
  expectedLinks?: PassageLink[];
}) {
  const routing = getSceneRoutingView(fw, scene);

  if (!routing.inChapter) {
    return (
      <div style={styles.box}>
        未加入任何章节场景池。请在「章节」页将本场景加入池子并配置叙事边或开放世界连通。
      </div>
    );
  }

  return (
    <div style={styles.box}>
      <p>
        所属章节：<strong>{routing.chapterTitle}</strong>
        {' · '}
        是否开放世界：<strong>{routing.narrativeGraph ? '否' : '是'}</strong>
        {routing.isEndScene ? ' · 章末场景' : ''}
      </p>
      {(routing.narrativeOutEdges.length > 0 || routing.transitions.length > 0) && (
        <>
          <div style={styles.label}>叙事出边 / 跨章</div>
          <ul style={{margin: '4px 0', paddingLeft: 18}}>
            {routing.narrativeOutEdges.map((v) => (
              <li key={v.edge.id}>
                「{v.edge.displayText}」→ {v.targetName}
                {v.edge.isBranch ? '（支线）' : ''}
              </li>
            ))}
            {routing.transitions.map((v) => (
              <li key={`${v.transition.fromSceneId}-${v.transition.toChapterId}`}>
                「{v.transition.displayText}」→ {v.targetChapterTitle} / {v.targetSceneName}
              </li>
            ))}
          </ul>
        </>
      )}
      <div style={styles.label}>编译后预期出口数：{routing.expectedLinkCount}</div>
      {routingStale && expectedLinks ? (
        <div style={styles.stale}>
          story.tw 链接过期。期望：{formatLinks(expectedLinks)}
        </div>
      ) : null}
      <p style={{marginTop: 8, fontSize: 12, color: '#888'}}>
        路由在「章节」页维护；变更后保存章节即可同步 story.tw 链接。
      </p>
    </div>
  );
}
