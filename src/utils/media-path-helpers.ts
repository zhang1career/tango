export function normalizeLogicalMediaPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isWavLogicalPath(path: string): boolean {
  return /\.wav$/i.test(normalizeLogicalMediaPath(path));
}

export function isMp3LogicalPath(path: string): boolean {
  return /\.mp3$/i.test(normalizeLogicalMediaPath(path));
}
