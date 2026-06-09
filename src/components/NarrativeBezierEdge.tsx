import React, {useCallback, useContext, useRef, useState} from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Position,
  useReactFlow,
} from '@xyflow/react';
import type {ChapterNarrativeEdge} from '../schema/story-framework';
import {
  findPathRatioNearPoint,
  getPathAngleAtRatio,
  getPathPointAtRatio,
} from '../utils/svg-path-position';

type NarrativeEdgeFlowData = ChapterNarrativeEdge & {effectiveLabelPosition?: number};

function arrowRatioForTarget(targetPosition: Position): number {
  if (targetPosition === Position.Top || targetPosition === Position.Bottom) return 0.78;
  return 0.88;
}

export const DEFAULT_NARRATIVE_LABEL_POSITION = 0.3;

export const NarrativeEdgeActionsContext = React.createContext<{
  onLabelPositionChange: (edgeId: string, labelPosition: number) => void;
}>({
  onLabelPositionChange: () => {},
});

type NarrativeEdgeProps = EdgeProps & {
  pathOptions?: {curvature?: number};
  data?: NarrativeEdgeFlowData;
};

export function NarrativeBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  selected,
  pathOptions,
}: NarrativeEdgeProps) {
  const {onLabelPositionChange} = useContext(NarrativeEdgeActionsContext);
  const {screenToFlowPosition} = useReactFlow();
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: pathOptions?.curvature,
  });
  const labelPosition = data?.effectiveLabelPosition ?? data?.labelPosition ?? DEFAULT_NARRATIVE_LABEL_POSITION;
  const {x: labelX, y: labelY} = getPathPointAtRatio(edgePath, labelPosition);
  const labelText = data?.displayText ?? '继续';
  const strokeColor = typeof style?.stroke === 'string' ? style.stroke : '#a78bfa';
  const arrowRatio = arrowRatioForTarget(targetPosition);
  const arrowTip = getPathPointAtRatio(edgePath, arrowRatio);
  const arrowAngle = getPathAngleAtRatio(edgePath, arrowRatio);
  const edgeStyle = {strokeWidth: 2, ...style};

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    draggingRef.current = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const flowPos = screenToFlowPosition({x: event.clientX, y: event.clientY});
      onLabelPositionChange(id, findPathRatioNearPoint(edgePath, flowPos.x, flowPos.y));
    },
    [edgePath, id, onLabelPositionChange, screenToFlowPosition]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} interactionWidth={18} />
      <g
        transform={`translate(${arrowTip.x}, ${arrowTip.y}) rotate(${arrowAngle})`}
        pointerEvents="none"
        aria-hidden
      >
        <polygon points="-5,-3 0,0 -5,3" fill={strokeColor} />
      </g>
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="拖拽可沿连线调整文案位置"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 9,
            color: '#b0b0b0',
            background: 'rgba(26, 26, 46, 0.92)',
            padding: '3px 5px',
            borderRadius: 3,
            lineHeight: 1.2,
            maxWidth: 120,
            textAlign: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            border: selected ? '1px solid #a78bfa' : '1px solid transparent',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {labelText}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
