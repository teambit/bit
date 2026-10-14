import { matchComponentPatterns, splitComponentPatterns } from '@teambit/scope/dist/component-id-patterns.js';
import { valid } from 'semver';

/** Canonical matcher receipt only; native selection retains eligibility/version ownership. */
export function tagPatternSelections(context: any, patterns: string[]) {
  if (!patterns.length) return undefined;
  const identities = context.targets.map((target: any) => target.identity);
  if (new Set(identities).size !== identities.length) throw new Error('tag duplicate workspace identity');
  const output: { identity: string; version: string | null; patternIndex: number }[] = [];
  for (const [patternIndex, text] of patterns.entries()) {
    const parts = text.split('@');
    if (parts.length > 2 || !parts[0]) throw new Error('tag pattern version');
    const [pattern, version] = parts;
    if (version !== undefined && !valid(version) && !['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'].includes(version)) throw new Error('tag per-pattern version');
    const parsed = splitComponentPatterns(pattern);
    if (parsed.some((entry) => entry.startsWith('$') || entry.includes(' AND '))) throw new Error('tag state selector');
    let matches: string[];
    if (pattern.includes('*') || pattern.includes(',')) matches = matchComponentPatterns(identities, parsed);
    else {
      if (!/^[a-zA-Z\d_./-]+$/.test(pattern)) throw new Error('tag literal resolution');
      matches = identities.filter((id: string) => id === pattern || id.endsWith(`/${pattern}`));
      if (matches.length !== 1) throw new Error('tag unresolved literal identity');
    }
    output.push(...matches.map((identity) => ({ identity, version: version ?? null, patternIndex })));
    if (output.length > 4096) throw new Error('tag selection budget');
  }
  return output;
}
