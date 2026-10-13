import { pathJoinLinux, type PathLinux } from '@teambit/toolbox.path.path';

export function rebaseIgnorePattern(pattern: string, dir: PathLinux): string {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const anchored = body.slice(0, -1).includes('/');
  // a trailing slash means "directories only". the join drops it, so it is put back.
  const dirOnly = body.endsWith('/') ? '/' : '';
  const base = anchored ? pathJoinLinux(dir, body.replace(/^\//, '')) : pathJoinLinux(dir, '**', body);
  const rebased = base + dirOnly;
  return negated ? `!${rebased}` : rebased;
}
