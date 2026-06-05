/**
 * 游戏场景 Schema - 独立可编辑实体
 * 与章节为多对多关系，passage 名由 (章节index + 场景id) 组成
 * 场景不含人物属性变更，仅物品与声誉
 */

export interface ScenePassageRawBlock {
  type: 'raw';
  /** 直接透传到 story.tw passage 的正文片段 */
  text: string;
}

export type AiBlockPriority = 'low' | 'medium' | 'high';

export interface ScenePassageAiBlock {
  type: 'ai';
  /** AI 扩写依据（块级，必填） */
  summary: string;
  /** 块级字数上限（建议 160–220，默认 200，必填） */
  wordCount: number;
  /** 本块情绪目标 */
  emotion?: string;
  /** 必须出现的情节点或关键对白（锚点） */
  anchors?: string[];
  /** 禁止写入的内容（剧透、复述禁区等） */
  forbidden?: string[];
  /** 叙述视角 / 限知范围 */
  perspective?: string;
  /** 叙事权重 */
  priority?: AiBlockPriority;
  /** 文风（原 hints 中的体裁描述） */
  style?: string;
  /** 节奏 */
  pacing?: string;
  /** 人称 / 语态 */
  voice?: string;
  /** 硬性禁区与格式约束 */
  constraints?: string;
  /**
   * 本块可参与对白的人物 id（多选）。
   * 省略时继承 scene.characterIds；空数组表示本块不写具名对白。
   */
  characterIds?: string[];
  /** 引擎生成后的正文（仅存于 story-scenes.json，汇编时写入 story.tw） */
  generatedText?: string;
}

export type ScenePassageBlock = ScenePassageRawBlock | ScenePassageAiBlock;

/** 场景级人物覆写（用于替换人物集中的默认设定） */
export interface SceneCharacterOverride {
  /** 覆写人物描述 */
  description?: string;
  /** 覆写属性（对象整体替换） */
  attributes?: Record<string, string | number | boolean>;
  /** 覆写背包（数组 replace） */
  inventory?: string[];
  /** 覆写行为库（数组 replace） */
  behaviorLibrary?: import('./game-behavior').GameBehavior[];
}

/** 场景进入时的状态变更（不含人物属性） */
export interface SceneStateActions {
  /** 添加物品 */
  give?: string | string[];
  /** 移除物品 */
  take?: string | string[];
  /** 声誉变更 */
  rep?: Record<string, number>;
}

/** 主线场景上的支线选项定义（编译为 story.tw 条件跳转） */
export interface SceneBranchOption {
  /** 选项 id（建议全局唯一） */
  id: string;
  /** 在主线场景中展示给玩家的入口文案 */
  displayText: string;
  /** 该支线导向的失败结局标识/描述（用于内容治理与验收） */
  failureEnding: string;
  /** 支线路径（1-2 个场景，单向、不可成环） */
  branchSceneIds: string[];
  /** 主线 -> 支线入口的可见条件 */
  condition?: string;
  /** 支线内部“继续”文案；长度应为 branchSceneIds.length - 1 */
  continueDisplayTexts?: string[];
  /** 支线末端返回主线根场景的文案 */
  returnDisplayText?: string;
}

/** 场景定义 */
export interface GameScene {
  id: string;
  /** 展示用名称 */
  name: string;
  /** passage 正文块（有序）：首块必为 raw，其余为 ai；生成结果写入 story.tw */
  passageBlocks: ScenePassageBlock[];
  /** 进入该场景时的状态变更（仅物品、声誉） */
  stateActions?: SceneStateActions;
  /** 关联的地图节点 id */
  mapNodeId?: string;
  /** 该场景出场的人物 id 列表 */
  characterIds?: string[];
  /** 该场景“对手戏人物集”id 列表（供 AI 与交互使用，不再从 characterIds 自动推导） */
  counterpartCharacterIds?: string[];
  /** 场景级人物覆写：按人物 id 指定，数组字段语义为 replace */
  characterOverrides?: Record<string, SceneCharacterOverride>;
  /** 该场景关联的事件 id 列表 */
  eventIds?: string[];
  /** 规则 id 列表 */
  ruleIds?: string[];
  /** 条件（单行表达式，准入判断时先检查；不含回写逻辑） */
  conditions?: string;
  /** 是否已使用（通用字段，用于 only_once 等规则） */
  is_used?: boolean;
  /** 开场动画 URL（视频） */
  openingAnimation?: string;
  /** 配图列表（支持轮播） */
  images?: string[];
  /** 背景音乐 URL */
  backgroundMusic?: string;
  /** 合成后的背景音乐输出路径（media_gen/{gameId}/bgm/...，多为 mp3） */
  synthesizedBgm?: string;
  /** 场景消息列表（标题右侧滚动展示） */
  messages?: string[];
  /** 主线场景分出的支线选项（仅主线场景填写） */
  branchOptions?: SceneBranchOption[];
  /**
   * 同章后续主线入口文案。配置了 branchOptions 且同章还有下一主线场景时必填；
   * 分页子页仍使用「继续」，仅末页出口使用此文案。
   */
  mainlineLinkDisplayText?: string;
  /** 是否为支线失败结局（人工设置；空 BGM/配图时回落 story-features 统一预设） */
  branchFailureEnding?: boolean;
  /** 汇编失败结局模板时填入 {{failureEnding}} */
  branchFailureEndingText?: string;
}
