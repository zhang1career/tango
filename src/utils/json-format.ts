/**
 * 紧凑 JSON 格式化：最底层对象占据一行
 * 用于保存 story-maps、story-framework、metadata、items、events、characters 等
 */

function isLeafValue(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return true;
  if (Array.isArray(v)) return v.every((x) => typeof x !== 'object' || x === null);
  return false;
}

function isLeafObject(obj: object): boolean {
  return Object.values(obj).every(isLeafValue);
}

function indentStr(n: number): string {
  return '  '.repeat(n);
}

export function formatJsonCompact(data: unknown): string {
  const indent = (n: number) => indentStr(n);

  function fmt(val: unknown, depth: number): string {
    if (val === null) return 'null';
    if (typeof val === 'boolean') return String(val);
    if (typeof val === 'number') return JSON.stringify(val);
    if (typeof val === 'string') return JSON.stringify(val);

    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const allLeaf = val.every((x) => typeof x === 'object' && x !== null && !Array.isArray(x) && isLeafObject(x));
      if (allLeaf) {
        const lines = val.map((x) => indent(depth + 1) + JSON.stringify(x));
        return '[\n' + lines.join(',\n') + '\n' + indent(depth) + ']';
      }
      const lines = val.map((x) => indent(depth + 1) + fmt(x, depth + 1));
      return '[\n' + lines.join(',\n') + '\n' + indent(depth) + ']';
    }

    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>).filter(
        ([, v]) => v !== undefined
      );
      if (entries.length === 0) return '{}';
      const pad = indent(depth + 1);
      const lines = entries.map(([k, v]) => pad + JSON.stringify(k) + ': ' + fmt(v, depth + 1));
      return '{\n' + lines.join(',\n') + '\n' + indent(depth) + '}';
    }

    return JSON.stringify(val);
  }

  return fmt(data, 0);
}
