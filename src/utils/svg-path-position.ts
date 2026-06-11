const MIN_LABEL_POSITION = 0.08;
const MAX_LABEL_POSITION = 0.92;

export function clampLabelPosition(ratio: number): number {
  return Math.min(MAX_LABEL_POSITION, Math.max(MIN_LABEL_POSITION, ratio));
}

let svgMeasurePath: SVGPathElement | null = null;

function measureSvgPath(pathD: string): SVGPathElement {
  if (!svgMeasurePath) {
    svgMeasurePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  }
  svgMeasurePath.setAttribute('d', pathD);
  return svgMeasurePath;
}

function pointAtRatio(pathD: string, ratio: number): {x: number; y: number} {
  const path = measureSvgPath(pathD);
  const t = Math.min(1, Math.max(0, ratio));
  const point = path.getPointAtLength(path.getTotalLength() * t);
  return {x: point.x, y: point.y};
}

export function getPathPointAtRatio(pathD: string, ratio: number): {x: number; y: number} {
  return pointAtRatio(pathD, clampLabelPosition(ratio));
}

export function getPathAngleAtRatio(pathD: string, ratio: number): number {
  const t = Math.min(0.98, Math.max(0.02, ratio));
  const p0 = pointAtRatio(pathD, t - 0.03);
  const p1 = pointAtRatio(pathD, t + 0.03);
  return (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
}

export function findPathRatioNearPoint(pathD: string, x: number, y: number, samples = 48): number {
  const path = measureSvgPath(pathD);
  const total = path.getTotalLength();
  let best = 0.3;
  let bestDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = path.getPointAtLength(total * t);
    const dist = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return clampLabelPosition(best);
}
