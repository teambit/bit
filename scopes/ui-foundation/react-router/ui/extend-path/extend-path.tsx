// TODO: move to toolbox scope.
export function extendPath(prefix: string, path?: string | string[]) {
  if (!path) return prefix;
  if (typeof path === 'string') {
    return `${prefix}/${path}`;
  }

  return path.map((x) => extendPath(prefix, x));
}
