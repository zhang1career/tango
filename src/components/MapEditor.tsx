/**
 * 地图编辑界面 - Neo4j 风格图交互
 */

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {getMapsFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {StoryFramework} from '../schema/story-framework';
import type {GameMap, MapEdge, MapNode} from '../schema/game-map';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';

const GRID_GAP = 120;
const NODE_WIDTH = 60;
const NODE_HEIGHT = 24;

/** 从 displayText 解析方位：北/南/东/西，返回主方向或 null */
function parseDirectionFromDisplayText(text?: string): 'north' | 'south' | 'east' | 'west' | null {
  if (!text) return null;
  const t = text.trim();
  if (/北|北上|北至|北经|北向|北出/.test(t)) return 'north';
  if (/南|南下|南至|南经|南向|南出/.test(t)) return 'south';
  if (/东|东至|东经|东向|东出|御道东/.test(t)) return 'east';
  if (/西|西至|西经|西向|西出|御道西/.test(t)) return 'west';
  return null;
}

/** 根据方位或坐标计算边的 sourceHandle 与 targetHandle，实现最近连线 */
function computeHandleIds(
  fromId: string,
  toId: string,
  nodePos: Map<string, { x: number; y: number }>,
  displayText?: string
): { sourceHandle: string; targetHandle: string } {
  const src = nodePos.get(fromId);
  const tgt = nodePos.get(toId);
  type Side = 'top' | 'bottom' | 'left' | 'right';
  const toSourceHandle = (s: Side) => `source-${s}`;
  const toTargetHandle = (s: Side) => `target-${s}`;

  const dir = parseDirectionFromDisplayText(displayText);
  if (dir) {
    const pairs: Record<string, { source: Side; target: Side }> = {
      north: {source: 'top', target: 'bottom'},
      south: {source: 'bottom', target: 'top'},
      east: {source: 'right', target: 'left'},
      west: {source: 'left', target: 'right'},
    };
    const {source, target} = pairs[dir];
    return {sourceHandle: toSourceHandle(source), targetHandle: toTargetHandle(target)};
  }

  if (src && tgt) {
    const dy = tgt.y - src.y;
    const dx = tgt.x - src.x;
    const useNS = Math.abs(dy) >= Math.abs(dx);
    let source: Side;
    let target: Side;
    if (useNS) {
      source = dy < 0 ? 'top' : 'bottom';
      target = dy < 0 ? 'bottom' : 'top';
    } else {
      source = dx > 0 ? 'right' : 'left';
      target = dx > 0 ? 'left' : 'right';
    }
    return {sourceHandle: toSourceHandle(source), targetHandle: toTargetHandle(target)};
  }

  return {sourceHandle: toSourceHandle('bottom'), targetHandle: toTargetHandle('top')};
}

function mapToFlow(map: GameMap): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = map.nodes.map((n, i) => ({
    id: n.id,
    type: 'mapNode',
    position: {x: n.x ?? (i % 4) * GRID_GAP, y: n.y ?? Math.floor(i / 4) * GRID_GAP},
    data: {label: n.name || n.id, raw: n},
  }));
  const nodePos = new Map(nodes.map((n) => [n.id, n.position]));
  const edges: Edge[] = map.edges.map((e, i) => {
    const {sourceHandle, targetHandle} = computeHandleIds(
      e.from,
      e.to,
      nodePos,
      e.displayText
    );
    return {
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      sourceHandle,
      targetHandle,
      data: {displayText: e.displayText, condition: e.condition},
      label: e.displayText || undefined,
    };
  });
  return {nodes, edges};
}

function flowToMap(nodes: Node[], edges: Edge[], prevMap: GameMap): GameMap {
  new Map(nodes.map((n) => [n.id, n]));
  const prevNodeMap = new Map(prevMap.nodes.map((n) => [n.id, n]));
  const newNodes: MapNode[] = nodes.map((n) => {
    const raw = (n.data?.raw as MapNode) ?? prevNodeMap.get(n.id);
    return {
      ...(raw ?? {id: n.id, name: String(n.data?.label ?? n.id), items: [], characterIds: []}),
      id: n.id,
      name: String(n.data?.label ?? raw?.name ?? n.id),
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
    };
  });
  const newEdges: MapEdge[] = edges.map((e) => {
    const prev = prevMap.edges.find((x) => x.from === e.source && x.to === e.target);
    const data = e.data as { displayText?: string; condition?: string };
    return {
      from: e.source,
      to: e.target,
      displayText: data?.displayText ?? prev?.displayText,
      condition: data?.condition ?? prev?.condition,
    };
  });
  return {...prevMap, nodes: newNodes, edges: newEdges};
}

function MapNodeComponent({data, selected}: { data: { label: string; raw?: MapNode }; selected?: boolean }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        minWidth: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        backgroundColor: selected ? '#3d2d64' : '#252540',
        border: `1px solid ${selected ? '#a78bfa' : '#444'}`,
        borderRadius: 6,
        color: '#e8e8e8',
        fontSize: 12,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} id="target-top" style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="target" position={Position.Bottom} id="target-bottom"
              style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="target" position={Position.Left} id="target-left"
              style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="target" position={Position.Right} id="target-right"
              style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="source" position={Position.Top} id="source-top" style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="source" position={Position.Bottom} id="source-bottom"
              style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="source" position={Position.Left} id="source-left"
              style={{background: '#888', width: 8, height: 8}}/>
      <Handle type="source" position={Position.Right} id="source-right"
              style={{background: '#888', width: 8, height: 8}}/>
      <span>{data?.label || '节点'}</span>
    </div>
  );
}

const nodeTypes = {mapNode: MapNodeComponent};

function NodePropsPanel({
                          node,
                          onUpdate,
                        }: {
  node: Node;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const raw = (node.data?.raw as MapNode) ?? {id: node.id, name: String(node.data?.label)};
  const [name, setName] = React.useState(raw.name ?? '');
  const [rules, setRules] = React.useState((raw.rules ?? []).join('\n'));
  const [items, setItems] = React.useState((raw.items ?? []).join(', '));
  const charIds = raw.characterIds ?? raw.npcs ?? [];
  const [characterIdsStr, setCharacterIdsStr] = React.useState(charIds.join(', '));
  React.useEffect(() => {
    setName(raw.name ?? '');
    setRules((raw.rules ?? []).join('\n'));
    setItems((raw.items ?? []).join(', '));
    setCharacterIdsStr((raw.characterIds ?? raw.npcs ?? []).join(', '));
  }, [node.id]);
  const commit = () => {
    const nextRaw: MapNode = {
      ...raw,
      name,
      rules: rules.trim() ? rules.split('\n').filter(Boolean) : undefined,
      items: items.trim() ? items.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : undefined,
      characterIds: characterIdsStr.trim() ? characterIdsStr.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : undefined,
    };
    onUpdate({label: name, raw: nextRaw});
  };
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
  return (
    <div
      style={{
        background: '#1e1e32',
        borderRadius: 8,
        padding: 14,
        border: '1px solid #444',
      }}
    >
      <div style={{fontSize: 13, color: '#a78bfa', marginBottom: 12}}>编辑节点</div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} style={inputStyle}/>
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>规则（每行一条）</label>
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} onBlur={commit}
                  style={{...inputStyle, minHeight: 50}}/>
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>物品（逗号分隔）</label>
        <input value={items} onChange={(e) => setItems(e.target.value)} onBlur={commit} style={inputStyle}/>
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>人物 id（逗号分隔）</label>
        <input value={characterIdsStr} onChange={(e) => setCharacterIdsStr(e.target.value)} onBlur={commit}
               style={inputStyle}/>
      </div>
    </div>
  );
}

function EdgePropsPanel({
                          edge,
                          onUpdate,
                        }: {
  edge: Edge;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const data = (edge.data ?? {}) as { displayText?: string; condition?: string };
  const [displayText, setDisplayText] = React.useState(data.displayText ?? '');
  const [condition, setCondition] = React.useState(data.condition ?? '');
  React.useEffect(() => {
    setDisplayText(data.displayText ?? '');
    setCondition(data.condition ?? '');
  }, [edge.id]);
  const commit = () => onUpdate({displayText: displayText || undefined, condition: condition || undefined});
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
  return (
    <div style={{background: '#1e1e32', borderRadius: 8, padding: 14, border: '1px solid #444'}}>
      <div style={{fontSize: 13, color: '#a78bfa', marginBottom: 12}}>编辑连接</div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>选项文案</label>
        <input value={displayText} onChange={(e) => setDisplayText(e.target.value)} onBlur={commit} style={inputStyle}/>
      </div>
      <div style={{marginBottom: 10}}>
        <label style={{fontSize: 12, color: '#888'}}>条件表达式</label>
        <input value={condition} onChange={(e) => setCondition(e.target.value)} onBlur={commit} style={inputStyle}
               placeholder={'$items has "令牌"'}/>
      </div>
      <div style={{fontSize: 11, color: '#666'}}>{edge.source} → {edge.target}</div>
    </div>
  );
}

/** 保存地图到预设路径 assets/games/{gameId}/story-maps.json，开发模式下直接写入文件无弹窗 */
async function saveMapsToPreset(maps: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getMapsFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(maps),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(maps)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-maps.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

function MapCanvasInner({
                          map,
                          onUpdate,
                          onClose,
                          onSave,
                        }: {
  map: GameMap;
  mapIndex: number;
  onUpdate: (fn: (m: GameMap) => GameMap) => void;
  onClose: () => void;
  onSave?: (currentMap: GameMap) => void;
}) {
  const {nodes: initialNodes, edges: initialEdges} = useMemo(() => mapToFlow(map), [map.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const selNode = nodes.find((n) => n.selected);
  const selEdge = edges.find((e) => e.selected);
  const addNodeAtRef = useRef<{ x: number; y: number } | null>(null);
  const syncRef = useRef(false);

  useEffect(() => {
    const {nodes: n, edges: e} = mapToFlow(map);
    setNodes(n);
    setEdges(e);
  }, [map.id]);

  const syncToMap = useCallback(() => {
    if (syncRef.current) return;
    const next = flowToMap(nodes, edges, map);
    if (JSON.stringify(next) !== JSON.stringify(map)) {
      onUpdate(() => next);
    }
  }, [nodes, edges, map, onUpdate]);

  useEffect(() => {
    syncRef.current = true;
    const t = setTimeout(() => {
      syncRef.current = false;
      syncToMap();
    }, 100);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      setEdges((eds) =>
        addEdge(
          {...conn, data: {displayText: '', condition: ''}},
          eds
        )
      );
    },
    [setEdges]
  );

  const handleAddNode = useCallback(() => {
    addNodeAtRef.current = {x: 0, y: 0};
    setNodes((nds) => {
      const last = nds[nds.length - 1];
      const base = last ? {x: last.position.x + GRID_GAP, y: last.position.y} : {x: 100, y: 100};
      const id = `node_${Date.now()}`;
      const newNode: Node = {
        id,
        type: 'mapNode',
        position: base,
        data: {label: '新地点', raw: {id, name: '新地点', x: base.x, y: base.y, items: [], characterIds: []}},
      };
      return [...nds, newNode];
    });
  }, [setNodes]);

  const handlePaneClick = useCallback(
    () => {
      if (addNodeAtRef.current) {
        addNodeAtRef.current = null;
      }
    },
    []
  );

  const handleDelete = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const selNodes = nodes.filter((n) => n.selected);
      const selEdges = edges.filter((ed) => ed.selected);
      if (selNodes.length > 0 || selEdges.length > 0) {
        e.preventDefault();
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((ed) => !ed.selected));
      }
    },
    [nodes, edges, setNodes, setEdges]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [handleDelete]);

  return (
    <div style={{width: '100%', height: '100%', position: 'relative', background: '#1a1a2e'}}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{stroke: '#a78bfa'}}
        defaultEdgeOptions={{type: 'smoothstep', style: {stroke: '#666'}}}
      >
        <Background color="#333" gap={16}/>
        <Controls style={{bottom: 50}}/>
        <MiniMap
          nodeColor="#252540"
          maskColor="rgba(0,0,0,0.6)"
          style={{width: 120, height: 80, bottom: 10, left: 10}}
        />
        <Panel position="top-left" style={{margin: 12}}>
          <button type="button" onClick={onClose} style={btnStyle}>
            ← 返回
          </button>
        </Panel>
        <Panel position="top-right"
               style={{margin: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8}}>
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
            <button type="button" onClick={handleAddNode} style={btnStyle}>
              + 添加节点
            </button>
            {onSave && (
              <button
                type="button"
                onClick={async () => {
                  onSave(flowToMap(nodes, edges, map));
                }}
                style={btnStyle}
              >
                保存
              </button>
            )}
          </div>
          {selNode && (
            <div style={{width: 260, maxHeight: '80vh', overflow: 'auto'}}>
              <NodePropsPanel
                node={selNode}
                onUpdate={(data) =>
                  setNodes((nds) =>
                    nds.map((n) => (n.id === selNode.id ? {...n, data: {...n.data, ...data}} : n))
                  )
                }
              />
            </div>
          )}
          {selEdge && !selNode && (
            <div style={{width: 260}}>
              <EdgePropsPanel
                edge={selEdge}
                onUpdate={(data) =>
                  setEdges((eds) =>
                    eds.map((e) =>
                      e.id === selEdge.id
                        ? {
                          ...e,
                          data: {...e.data, ...data},
                          label: (data as { displayText?: string }).displayText ?? e.label
                        }
                        : e
                    )
                  )
                }
              />
            </div>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}

function MapFormContent({
                          map,
                          editable,
                          onUpdate,
                        }: {
  map: GameMap;
  editable: boolean;
  onUpdate?: (fn: (m: GameMap) => GameMap) => void;
}) {
  if (!editable || !onUpdate) {
    return (
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>名称：</strong>{map.name || map.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>ID：</strong>{map.id}</p>
      </div>
    );
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: 10, backgroundColor: '#252540', border: '1px solid #333',
    borderRadius: 6, color: '#e8e8e8', fontSize: 14, marginTop: 4,
  };
  return (
    <div>
      <div style={{marginBottom: 12}}>
        <label style={{display: 'block', marginBottom: 4, fontSize: 13, color: '#a78bfa'}}>ID</label>
        <input
          value={map.id}
          onChange={(e) => onUpdate((m) => ({...m, id: e.target.value}))}
          style={inputStyle}
          placeholder="map_xxx"
        />
      </div>
      <div style={{marginBottom: 12}}>
        <label style={{display: 'block', marginBottom: 4, fontSize: 13, color: '#a78bfa'}}>名称</label>
        <input
          value={map.name}
          onChange={(e) => onUpdate((m) => ({...m, name: e.target.value}))}
          style={inputStyle}
          placeholder="未命名地图"
        />
      </div>
    </div>
  );
}

function MapDetailModal({map, onClose}: { map: GameMap; onClose: () => void }) {
  return (
    <DetailEditModal title="地图详情" open={true} onClose={onClose} editable={false}>
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>名称：</strong>{map.name || map.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>ID：</strong>{map.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>节点数：</strong>{map.nodes.length}</p>
        <p style={{margin: '0 0 8px'}}><strong>连接数：</strong>{map.edges.length}</p>
        {map.nodes.length > 0 && (
          <>
            <p style={{margin: '0 0 4px'}}><strong>节点：</strong></p>
            <ul style={{margin: '0 0 12px 20px', padding: 0}}>{map.nodes.map((n) => (
              <li key={n.id}>{n.name || n.id}</li>
            ))}</ul>
          </>
        )}
      </div>
    </DetailEditModal>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: '#2d2d44',
  border: '1px solid #444',
  borderRadius: 6,
  color: '#e8e8e8',
  cursor: 'pointer',
  fontSize: 13,
};

function MapCanvas({
                     map,
                     mapIndex,
                     onUpdate,
                     onClose,
                     onSave,
                   }: {
  map: GameMap;
  mapIndex: number;
  onUpdate: (fn: (m: GameMap) => GameMap) => void;
  onClose: () => void;
  onSave?: (currentMap: GameMap) => void;
}) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner map={map} mapIndex={mapIndex} onUpdate={onUpdate} onClose={onClose} onSave={onSave}/>
    </ReactFlowProvider>
  );
}

export function MapEditor({
                            fw,
                            updateFw,
                          }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const {gameId} = useGameId();
  useEffect(() => {
    fetch(getMapsFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, maps: list as GameMap[]}));
      })
      .catch(() => {});
  }, [updateFw, gameId]);

  const maps = fw.maps ?? [];
  const setMaps = (fn: (m: GameMap[]) => GameMap[]) =>
    updateFw((d) => ({...d, maps: fn(d.maps ?? [])}));

  const [activeMapIndex, setActiveMapIndex] = React.useState<number | null>(null);
  const [detailMapIndex, setDetailMapIndex] = React.useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [newMap, setNewMap] = React.useState<GameMap>(() => ({
    id: `map_${Date.now()}`,
    name: '未命名地图',
    nodes: [],
    edges: [],
  }));

  const openAddModal = () => {
    setNewMap({id: `map_${Date.now()}`, name: '未命名地图', nodes: [], edges: []});
    setAddModalOpen(true);
  };

  const confirmAddMap = async () => {
    const next = [...maps, newMap];
    setMaps(() => next);
    const result = await saveMapsToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateMap = (index: number, fn: (m: GameMap) => GameMap) =>
    setMaps((m) => m.map((x, i) => (i === index ? fn(x) : x)));

  const removeMap = async (index: number) => {
    const next = maps.filter((_, i) => i !== index);
    setMaps(() => next);
    setActiveMapIndex(null);
    const result = await saveMapsToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const activeMap = activeMapIndex !== null ? maps[activeMapIndex] : null;

  if (activeMap && activeMapIndex !== null) {
    return (
      <div style={{width: '100vw', height: 'calc(100vh - 52px)', margin: 0, padding: 0}}>
        <MapCanvas
          map={activeMap}
          mapIndex={activeMapIndex}
          onUpdate={(fn) => updateMap(activeMapIndex, fn)}
          onClose={() => setActiveMapIndex(null)}
          onSave={async (currentMap) => {
            const nextMaps = [...(fw.maps ?? [])];
            nextMaps[activeMapIndex] = currentMap;
            updateFw((d) => ({...d, maps: nextMaps}));
            const result = await saveMapsToPreset(nextMaps, gameId);
            if (!result.ok) alert(`保存失败: ${result.error}`);
          }}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>地图</h1>
      </header>
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <label style={styles.label}>地图</label>
          <button type="button" style={styles.btnSmall} onClick={openAddModal}>
            + 添加地图
          </button>
        </div>
        {maps.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无地图，点击「添加地图」创建。</p>
        )}
        {maps.map((map, mi) => (
          <div key={map.id} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailMapIndex(mi)}
              >
                {map.name || map.id}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  · {map.nodes.length} 个节点 · {map.edges.length} 条连接
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setActiveMapIndex(mi)} title="编辑">
                  ✎
                </button>
                <button
                  type="button"
                  style={styles.btnIcon}
                  onClick={() => removeMap(mi)}
                  title="删除地图"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
        {detailMapIndex !== null && maps[detailMapIndex] && (
          <MapDetailModal
            map={maps[detailMapIndex]}
            onClose={() => setDetailMapIndex(null)}
          />
        )}
        {addModalOpen && (
          <DetailEditModal
            title="添加地图"
            open={true}
            onClose={() => setAddModalOpen(false)}
            editable={true}
            onSave={confirmAddMap}
          >
            <MapFormContent
              map={newMap}
              editable={true}
              onUpdate={(fn) => setNewMap(fn(newMap))}
            />
          </DetailEditModal>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 720, margin: '0 auto', padding: 20, color: '#e8e8e8'},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #333',
  },
  title: {fontSize: 20, fontWeight: 600, margin: 0},
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
  section: {marginBottom: 24},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa'},
  input: {
    padding: 8,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 14,
  },
  sectionHead: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  btnSmall: {
    padding: '4px 10px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12
  },
  btnIcon: {
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#1e1e32',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#252540',
  },
  cardBody: {padding: 16},
};
