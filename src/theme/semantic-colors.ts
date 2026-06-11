/**
 * 语义色：警告 / 主线 / 支线 / 叙事态 / 开放世界态
 */

export const semanticColors = {
  /** 警告：待汇编等需关注状态 */
  warning: {
    fg: '#ffd54f',
    bg: 'rgba(255, 213, 79, 0.28)',
    bgSubtle: 'rgba(255, 213, 79, 0.12)',
  },
  /** 主线叙事边 */
  mainline: {
    stroke: '#22c55e',
  },
  /** 支线叙事边 */
  branch: {
    stroke: '#84cc16',
  },
  /** 叙事态（非开放世界） */
  narrative: {
    fg: '#60a5fa',
    border: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.14)',
    selectedBg: 'rgba(59, 130, 246, 0.28)',
    selectedBorder: '#60a5fa',
  },
  /** 开放世界态 */
  openWorld: {
    fg: '#c4b5fd',
    border: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.14)',
    selectedBg: 'rgba(139, 92, 246, 0.28)',
    selectedBorder: '#a78bfa',
  },
} as const;

export type SceneModePalette = {
  fg: string;
  border: string;
  bg: string;
  selectedBg: string;
  selectedBorder: string;
};

/** narrativeGraph === true 表示叙事态（非开放世界） */
export function sceneModePalette(isNarrative: boolean): SceneModePalette {
  return isNarrative ? semanticColors.narrative : semanticColors.openWorld;
}

export function narrativeEdgeStroke(isBranch?: boolean): string {
  return isBranch ? semanticColors.branch.stroke : semanticColors.mainline.stroke;
}
