import joinPath from 'join-path';

export function extendPath(prefix: string, path?: string | string[]) {
  if (!path) return prefix;
  if (typeof path === 'string') {
    return joinPath(prefix, path);
  }

  return path.map((x) => extendPath(prefix, x));
}
