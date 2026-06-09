/**
 * 章节叙事图 - ReactFlow 可拖拽编辑
 */

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  addEdge,
  applyEdgeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {ChapterNarrativeEdge, FrameworkChapter} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {edgeIsBranch} from '../utils/branch-model';
import {isNarrativeGraph} from '../utils/chapter-scene';
import {
  DEFAULT_NARRATIVE_LABEL_POSITION,
  NarrativeBezierEdge,
  NarrativeEdgeActionsContext,
} from './NarrativeBezierEdge';
import {narrativeEdgeStroke, sceneModePalette, semanticColors} from '../theme/semantic-colors';

const GRID_GAP = 140;
const NODE_WIDTH = 88;
const GRAPH_CANVAS_HEIGHT = 520;
const SYMMETRIC_EDGE_CURVATURE = 0.38;
const SYMMETRIC_REVERSE_LABEL_POSITION = 0.7;

function edgePairKey(source: string, target: string): string {
  return `${source}\0${target}`;
}

function findSymmetricEdgeKeys(edges: Array<{source: string; target: string}>): Set<string> {
  const forward = new Set(edges.map((e) => edgePairKey(e.source, e.target)));
  const symmetric = new Set<string>();
  for (const key of forward) {
    const [source, target] = key.split('\0');
    if (forward.has(edgePairKey(target, source))) {
      symmetric.add(key);
    }
  }
  return symmetric;
}

function symmetricEdgePathOptions(
  source: string,
  target: string,
  symmetricKeys: Set<string>,
  isBranch?: boolean
): {curvature: number} | undefined {
  if (isBranch || !symmetricKeys.has(edgePairKey(source, target))) return undefined;
  return {curvature: source < target ? SYMMETRIC_EDGE_CURVATURE : -SYMMETRIC_EDGE_CURVATURE};
}

type NarrativeFlowEdge = Edge & {pathOptions?: {curvature: number}};

function layoutSymmetricNarrativeEdges(edges: Edge[], nodes: Node[]): Edge[] {
  return enrichNarrativeEdgeVisuals(edges, nodes);
}

function narrativeEdgeStyle(stroke: string): React.CSSProperties {
  return {stroke, strokeWidth: 2};
}

type HandleSide = 'top' | 'bottom' | 'left' | 'right';

function toSourceHandle(side: HandleSide): string {
  return `source-${side}`;
}

function toTargetHandle(side: HandleSide): string {
  return `target-${side}`;
}

function defaultNarrativeHandleIds(isBranch?: boolean): {sourceHandle: string; targetHandle: string} {
  if (isBranch) {
    return {sourceHandle: toSourceHandle('right'), targetHandle: toTargetHandle('left')};
  }
  return {sourceHandle: toSourceHandle('bottom'), targetHandle: toTargetHandle('top')};
}

function handlesPinned(data: ChapterNarrativeEdge): boolean {
  return !!(data.handlesPinned && data.sourceHandle && data.targetHandle);
}

function resolveNarrativeHandles(edge: ChapterNarrativeEdge): {sourceHandle: string; targetHandle: string} {
  if (handlesPinned(edge)) {
    return {sourceHandle: edge.sourceHandle!, targetHandle: edge.targetHandle!};
  }
  return defaultNarrativeHandleIds(edgeIsBranch(edge));
}

function defaultLabelPosition(
  source: string,
  target: string,
  symmetricKeys: Set<string>,
  saved?: number
): number | undefined {
  if (saved != null) return saved;
  if (symmetricKeys.has(edgePairKey(source, target))) {
    return source < target ? DEFAULT_NARRATIVE_LABEL_POSITION : SYMMETRIC_REVERSE_LABEL_POSITION;
  }
  return DEFAULT_NARRATIVE_LABEL_POSITION;
}

function newEdgeId(from: string, to: string): string {
  return `e_${from}_${to}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function defaultPosition(index: number, total: number): {x: number; y: number} {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {x: col * GRID_GAP, y: row * GRID_GAP};
}

function SceneNodeComponent({
  data,
  selected,
}: {
  data: {label: string; narrativeGraph: boolean; sceneId: string};
  selected?: boolean;
}) {
  const mode = sceneModePalette(data.narrativeGraph);
  return (
    <div
      style={{
        padding: '5px 8px',
        minWidth: NODE_WIDTH,
        backgroundColor: selected ? mode.selectedBg : mode.bg,
        border: `2px solid ${selected ? mode.selectedBorder : mode.border}`,
        borderRadius: 6,
        color: '#e8e8e8',
        fontSize: 10,
        textAlign: 'center',
        lineHeight: 1.3,
      }}
    >
      <Handle type="target" position={Position.Top} id="target-top" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="target" position={Position.Left} id="target-left" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="target" position={Position.Right} id="target-right" style={{background: '#888', width: 8, height: 8}} />
      <div style={{fontWeight: 600, fontSize: 10}}>{data.label}</div>
      <div style={{fontSize: 8, color: mode.fg, marginTop: 2}}>
        {data.narrativeGraph ? '叙事' : '开放世界'}
      </div>
      <Handle type="source" position={Position.Top} id="source-top" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="source" position={Position.Left} id="source-left" style={{background: '#888', width: 8, height: 8}} />
      <Handle type="source" position={Position.Right} id="source-right" style={{background: '#888', width: 8, height: 8}} />
    </div>
  );
}

const nodeTypes = {chapterScene: SceneNodeComponent};
const edgeTypes = {narrativeBezier: NarrativeBezierEdge};

type NarrativeEdgeFlowData = ChapterNarrativeEdge & {
  effectiveLabelPosition?: number;
};

function enrichNarrativeEdgeVisuals(edges: Edge[], _nodes: Node[]): Edge[] {
  const symmetricKeys = findSymmetricEdgeKeys(edges);
  return edges.map((e) => {
    const data = (e.data ?? {}) as unknown as NarrativeEdgeFlowData;
    const pathOptions = symmetricEdgePathOptions(e.source, e.target, symmetricKeys, edgeIsBranch(data));
    const effectiveLabelPosition = defaultLabelPosition(
      e.source,
      e.target,
      symmetricKeys,
      data.labelPosition
    );
    const resolvedHandles = resolveNarrativeHandles(data);
    const next: NarrativeFlowEdge = {
      ...e,
      ...resolvedHandles,
      data: {...data, effectiveLabelPosition},
    };
    if (pathOptions) {
      next.pathOptions = pathOptions;
    } else {
      delete next.pathOptions;
    }
    return next;
  });
}

function chapterToFlow(
  ch: FrameworkChapter,
  pool: string[],
  sceneMap: Map<string, GameScene>
): {nodes: Node[]; edges: Edge[]} {
  const layout = ch.graphLayout ?? {};
  const nodes: Node[] = pool.map((sid, i) => {
    const pos = layout[sid] ?? defaultPosition(i, pool.length);
    return {
      id: sid,
      type: 'chapterScene',
      position: pos,
      data: {
        label: sceneMap.get(sid)?.name ?? sid,
        narrativeGraph: isNarrativeGraph(ch, sid),
        sceneId: sid,
      },
    };
  });

  const rawEdges: Edge[] = (ch.narrativeEdges ?? []).map((e) => {
    const stroke = narrativeEdgeStroke(e.isBranch);
    return {
      id: e.id,
      source: e.fromSceneId,
      target: e.toSceneId,
      data: {...e},
      type: 'narrativeBezier',
      style: narrativeEdgeStyle(stroke),
    };
  });
  const edges = layoutSymmetricNarrativeEdges(rawEdges, nodes);

  return {nodes, edges};
}

function flowToChapter(
  nodes: Node[],
  edges: Edge[],
  ch: FrameworkChapter
): Pick<FrameworkChapter, 'narrativeEdges' | 'graphLayout'> {
  const graphLayout: Record<string, {x: number; y: number}> = {};
  for (const n of nodes) {
    graphLayout[n.id] = {x: n.position.x, y: n.position.y};
  }

  const existing = new Map((ch.narrativeEdges ?? []).map((e) => [e.id, e]));
  const narrativeEdges: ChapterNarrativeEdge[] = edges.map((e) => {
    const data = (e.data ?? {}) as unknown as NarrativeEdgeFlowData;
    const prev = existing.get(e.id);
    const labelText = typeof e.label === 'string' ? e.label : '';
    return {
      id: e.id,
      fromSceneId: e.source,
      toSceneId: e.target,
      displayText: data.displayText ?? (labelText || '继续'),
      condition: data.condition ?? prev?.condition,
      isBranch: data.isBranch ?? prev?.isBranch,
      labelPosition: data.labelPosition ?? prev?.labelPosition,
      ...(data.handlesPinned && data.sourceHandle && data.targetHandle
        ? {
            handlesPinned: true,
            sourceHandle: data.sourceHandle,
            targetHandle: data.targetHandle,
          }
        : {}),
    };
  });

  return {narrativeEdges, graphLayout};
}

function EdgePropsPanel({
  edge,
  pool,
  sceneMap,
  onUpdate,
  onDelete,
}: {
  edge: Edge;
  pool: string[];
  sceneMap: Map<string, GameScene>;
  onUpdate: (patch: Partial<ChapterNarrativeEdge> & {fromSceneId?: string; toSceneId?: string}) => void;
  onDelete: () => void;
}) {
  const data = (edge.data ?? {}) as unknown as NarrativeEdgeFlowData;
  const [fromSceneId, setFromSceneId] = React.useState(edge.source);
  const [toSceneId, setToSceneId] = React.useState(edge.target);
  const [displayText, setDisplayText] = React.useState(data.displayText ?? '');
  const [condition, setCondition] = React.useState(data.condition ?? '');
  const [isBranch, setIsBranch] = React.useState(!!data.isBranch);

  React.useEffect(() => {
    setFromSceneId(edge.source);
    setToSceneId(edge.target);
    setDisplayText(data.displayText ?? '');
    setCondition(data.condition ?? '');
    setIsBranch(!!data.isBranch);
  }, [edge.id, edge.source, edge.target]);

  const buildPatch = (
    overrides: Partial<{
      fromSceneId: string;
      toSceneId: string;
      displayText: string;
      condition: string;
      isBranch: boolean;
    }> = {}
  ) => {
    const from = overrides.fromSceneId ?? fromSceneId;
    const to = overrides.toSceneId ?? toSceneId;
    if (from === to) return;
    const branch = overrides.isBranch ?? isBranch;
    onUpdate({
      fromSceneId: from,
      toSceneId: to,
      displayText: (overrides.displayText ?? displayText) || '继续',
      condition: (overrides.condition ?? condition).trim() || undefined,
      isBranch: branch || undefined,
    });
  };

  const commit = () => buildPatch();

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 8,
    marginTop: 4,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 13,
  };
  const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 12,
  };

  const sceneLabel = (id: string) => sceneMap.get(id)?.name ?? id;

  return (
    <div style={{background: '#1e1e32', borderRadius: 8, padding: 14, border: '1px solid #444', width: 280}}>
      <div style={{fontSize: 13, color: semanticColors.mainline.stroke, marginBottom: 12}}>编辑叙事边</div>
      <div style={{display: 'flex', gap: 8, marginBottom: 10}}>
        <div style={{flex: 1}}>
          <label style={{fontSize: 12, color: '#888'}}>从</label>
          <select
            value={fromSceneId}
            onChange={(e) => {
              const v = e.target.value;
              setFromSceneId(v);
              buildPatch({fromSceneId: v});
            }}
            style={inputStyle}
          >
            {pool.map((id) => (
              <option key={id} value={id}>{sceneLabel(id)}</option>
            ))}
          </select>
        </div>
        <div style={{flex: 1}}>
          <label style={{fontSize: 12, color: '#888'}}>到</label>
          <select
            value={toSceneId}
            onChange={(e) => {
              const v = e.target.value;
              setToSceneId(v);
              buildPatch({toSceneId: v});
            }}
            style={inputStyle}
          >
            {pool.map((id) => (
              <option key={id} value={id}>{sceneLabel(id)}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>文案</label>
        <input value={displayText} onChange={(e) => setDisplayText(e.target.value)} onBlur={commit} style={inputStyle} />
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>条件</label>
        <input value={condition} onChange={(e) => setCondition(e.target.value)} onBlur={commit} style={inputStyle} />
      </div>
      <div style={{marginBottom: 10}}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: isBranch ? semanticColors.branch.stroke : '#888',
          }}
        >
          <input
            type="checkbox"
            checked={isBranch}
            onChange={(e) => {
              setIsBranch(e.target.checked);
              buildPatch({isBranch: e.target.checked});
            }}
          />
          支线
        </label>
        <p style={{margin: '6px 0 0', fontSize: 11, color: '#666', lineHeight: 1.4}}>
          章节只定义结构；是否失败结局请在目标场景的「失败支线」中配置。
        </p>
      </div>
      <button type="button" onClick={onDelete} style={{...btnStyle, color: '#e57373'}}>
        删除边
      </button>
    </div>
  );
}

function ChapterGraphInner({
  ch,
  pool,
  sceneMap,
  onUpdate,
  onOpenScene,
}: {
  ch: FrameworkChapter;
  pool: string[];
  sceneMap: Map<string, GameScene>;
  onUpdate: (patch: Pick<FrameworkChapter, 'narrativeEdges' | 'graphLayout'>) => void;
  onOpenScene?: (sceneId: string) => void;
}) {
  const initial = useMemo(() => chapterToFlow(ch, pool, sceneMap), [ch.id, pool.join('|')]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges] = useEdgesState(initial.edges);
  const setEdgesWithLayout = useCallback(
    (updater: Edge[] | ((eds: Edge[]) => Edge[])) => {
      setEdges((eds) => {
        const next = typeof updater === 'function' ? updater(eds) : updater;
        return layoutSymmetricNarrativeEdges(next, nodes);
      });
    },
    [setEdges, nodes]
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdgesWithLayout((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdgesWithLayout]
  );
  const handleLabelPositionChange = useCallback(
    (edgeId: string, labelPosition: number) => {
      setEdgesWithLayout((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: {
                  ...(e.data as unknown as NarrativeEdgeFlowData),
                  labelPosition,
                  effectiveLabelPosition: labelPosition,
                },
              }
            : e
        )
      );
    },
    [setEdgesWithLayout]
  );
  const syncRef = useRef(false);
  const selEdge = edges.find((e) => e.selected);
  const selNode = nodes.find((n) => n.selected);

  useEffect(() => {
    const {nodes: n, edges: e} = chapterToFlow(ch, pool, sceneMap);
    setNodes(n);
    setEdges(e);
  }, [ch.id, ch.narrativeEdges, ch.graphLayout, pool.join('|')]);

  const nodeLayoutKey = useMemo(
    () => nodes.map((n) => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`).join('|'),
    [nodes]
  );

  useEffect(() => {
    setEdges((eds) => layoutSymmetricNarrativeEdges(eds, nodes));
  }, [nodeLayoutKey, nodes, setEdges]);

  const syncToChapter = useCallback(() => {
    if (syncRef.current) return;
    const patch = flowToChapter(nodes, edges, ch);
    const sameEdges =
      JSON.stringify(patch.narrativeEdges) === JSON.stringify(ch.narrativeEdges ?? []);
    const sameLayout = JSON.stringify(patch.graphLayout) === JSON.stringify(ch.graphLayout ?? {});
    if (sameEdges && sameLayout) return;
    onUpdate(patch);
  }, [nodes, edges, ch, onUpdate]);

  useEffect(() => {
    syncRef.current = true;
    const t = setTimeout(() => {
      syncRef.current = false;
      syncToChapter();
    }, 150);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const id = newEdgeId(conn.source, conn.target);
      const stroke = narrativeEdgeStroke();
      const pinnedHandles =
        conn.sourceHandle && conn.targetHandle
          ? {
              sourceHandle: conn.sourceHandle,
              targetHandle: conn.targetHandle,
              handlesPinned: true,
            }
          : {};
      setEdgesWithLayout((eds) =>
        addEdge(
          {
            ...conn,
            id,
            data: {
              id,
              fromSceneId: conn.source,
              toSceneId: conn.target,
              displayText: '继续',
              ...pinnedHandles,
            },
            type: 'narrativeBezier',
            style: narrativeEdgeStyle(stroke),
          },
          eds
        )
      );
    },
    [setEdgesWithLayout]
  );

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdgesWithLayout((eds) => {
        const next = reconnectEdge(oldEdge, newConnection, eds);
        return next.map((e) => {
          if (e.id !== oldEdge.id) return e;
          const data = (e.data ?? {}) as unknown as NarrativeEdgeFlowData;
          return {
            ...e,
            data: {
              ...data,
              sourceHandle: e.sourceHandle ?? undefined,
              targetHandle: e.targetHandle ?? undefined,
              handlesPinned: true,
            },
          };
        });
      });
    },
    [setEdgesWithLayout]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const c of changes) {
        if (c.type === 'select' && c.selected && onOpenScene) {
          // double-click handled separately
        }
      }
    },
    [onNodesChange, onOpenScene]
  );

  const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 12,
  };

  if (pool.length === 0) {
    return <p style={{fontSize: 12, color: '#888'}}>添加场景到池子后可编辑叙事图。</p>;
  }

  const panelOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 5,
    maxHeight: 'calc(100% - 16px)',
    overflow: 'auto',
    pointerEvents: 'auto',
  };

  return (
    <div
      style={{
        width: '100%',
        height: GRAPH_CANVAS_HEIGHT,
        position: 'relative',
        background: '#1a1a2e',
        borderRadius: 8,
        border: '1px solid #333',
        overflow: 'visible',
      }}
    >
      <NarrativeEdgeActionsContext.Provider value={{onLabelPositionChange: handleLabelPositionChange}}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        edgesReconnectable
        reconnectRadius={14}
        onNodeDoubleClick={(_, node) => onOpenScene?.(node.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        zoomOnScroll={false}
        preventScrolling={false}
        snapToGrid
        snapGrid={[16, 16]}
        style={{width: '100%', height: '100%'}}
        connectionLineStyle={{stroke: semanticColors.mainline.stroke}}
        defaultEdgeOptions={{
          type: 'narrativeBezier',
          style: narrativeEdgeStyle(narrativeEdgeStroke()),
        }}
      >
        <Background color="#333" gap={16} />
        <Controls style={{bottom: 8}} />
        <MiniMap nodeColor="#252540" maskColor="rgba(0,0,0,0.6)" style={{width: 100, height: 60, bottom: 8, right: 8}} />
      </ReactFlow>
      {selEdge && !selNode && (
        <div style={panelOverlayStyle}>
          <EdgePropsPanel
            edge={selEdge}
            pool={pool}
            sceneMap={sceneMap}
            onUpdate={(patch) =>
              setEdgesWithLayout((eds) =>
                eds.map((e) => {
                  if (e.id !== selEdge.id) return e;
                  const prevData = (e.data ?? {}) as unknown as NarrativeEdgeFlowData;
                  const source = patch.fromSceneId ?? e.source;
                  const target = patch.toSceneId ?? e.target;
                  const endpointsChanged =
                    patch.fromSceneId != null || patch.toSceneId != null;
                  const nextData = {
                    ...prevData,
                    ...patch,
                    fromSceneId: source,
                    toSceneId: target,
                  } as NarrativeEdgeFlowData;
                  if (endpointsChanged || patch.isBranch != null) {
                    delete nextData.sourceHandle;
                    delete nextData.targetHandle;
                    delete nextData.handlesPinned;
                  }
                  return {
                    ...e,
                    source,
                    target,
                    data: nextData as unknown as Record<string, unknown>,
                    style: narrativeEdgeStyle(narrativeEdgeStroke(patch.isBranch)),
                  };
                })
              )
            }
            onDelete={() => setEdgesWithLayout((eds) => eds.filter((e) => e.id !== selEdge.id))}
          />
        </div>
      )}
      {selNode && (
        <div style={panelOverlayStyle}>
          <div style={{background: '#1e1e32', borderRadius: 8, padding: 12, border: '1px solid #444', fontSize: 12}}>
            <div
              style={{
                color: sceneModePalette(!!selNode.data?.narrativeGraph).fg,
                marginBottom: 8,
              }}
            >
              {selNode.data?.label as string}
            </div>
            <button type="button" style={btnStyle} onClick={() => onOpenScene?.(selNode.id)}>
              打开场景编辑
            </button>
          </div>
        </div>
      )}
      </NarrativeEdgeActionsContext.Provider>
      <p style={{position: 'absolute', bottom: -22, left: 0, fontSize: 10, color: '#666', margin: 0}}>
        拖拽节点排布；拖线创建边；拖拽连线端点可调整上下左右连接位置；拖拽边上文案可沿连线调整位置；双击节点打开场景
      </p>
    </div>
  );
}

export function ChapterGraphCanvas(props: {
  ch: FrameworkChapter;
  pool: string[];
  sceneMap: Map<string, GameScene>;
  onUpdate: (patch: Pick<FrameworkChapter, 'narrativeEdges' | 'graphLayout'>) => void;
  onOpenScene?: (sceneId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <ChapterGraphInner {...props} />
    </ReactFlowProvider>
  );
}
