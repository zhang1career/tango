/**
 * 从 API 拉取 story-metadata 并更新 framework
 */
import {useEffect} from 'react';
import type {GameMetadata} from '../schema/metadata';
import type {StoryFramework} from '../schema/story-framework';

export function useStoryMetadata(
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
) {
  useEffect(() => {
    fetch('/api/story-metadata')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: {characterAttributes?: unknown}) => {
        const meta = data?.characterAttributes ? {characterAttributes: data.characterAttributes} : null;
        if (meta) updateFw((d) => ({...d, metadata: meta as GameMetadata}));
      })
      .catch(() => {});
  }, [updateFw]);
}
