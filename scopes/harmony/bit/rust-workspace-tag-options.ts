import { validateOptions } from '@teambit/snapping/dist/tag-cmd.js';
import { valid } from 'semver';

export type RustWorkspaceTagOptions = {
  message?: string;
  unmodified: boolean;
  unmerged: boolean;
  patterns: string[];
  releaseType: string;
  autoTagReleaseType?: string;
  incrementBy: number;
  exactVersion?: string;
  preReleaseId?: string;
  snapped: boolean;
  skipAutoTag: boolean;
};

/** Ordinary persisted tags only; editor/build/soft/publish flags remain canonical. */
export function parseRustWorkspaceTag(args: string[]): RustWorkspaceTagOptions | undefined {
  if (!['tag', 't'].includes(args[0])) return undefined;
  const values: any = {};
  const patterns: string[] = [];
  const seen = new Set<string>();
  const aliases: Record<string, string> = { '-m': '--message', '-u': '--unmodified', '-v': '--ver', '-l': '--increment', '-p': '--patch' };
  const booleans: Record<string, string> = { '--unmodified': 'unmodified', '--unmerged': 'unmerged', '--snapped': 'snapped', '--skip-auto-tag': 'skipAutoTag', '--patch': 'patch', '--minor': 'minor', '--major': 'major' };
  const strings: Record<string, string> = { '--message': 'message', '--ver': 'ver', '--increment': 'increment', '--auto-tag-increment': 'autoTagIncrement', '--prerelease-id': 'prereleaseId', '--increment-by': 'incrementBy' };
  for (let index = 1; index < args.length; index++) {
    const argument = Object.hasOwn(aliases, args[index]) ? aliases[args[index]] : args[index];
    if (!argument.startsWith('-')) {
      if (!argument || argument.length > 4096 || argument.includes('\0') || argument.split(',').some((part) => part.trim().startsWith('$') || part.includes(' AND '))) return undefined;
      patterns.push(argument);
      continue;
    }
    if (seen.has(argument)) return undefined;
    seen.add(argument);
    if (booleans[argument]) values[booleans[argument]] = true;
    else if (strings[argument]) {
      const value = args[++index];
      if (value === undefined || value.startsWith('-')) return undefined;
      values[strings[argument]] = value;
    } else if (argument === '--pre-release') {
      values.preRelease = args[index + 1] && !args[index + 1].startsWith('-') ? args[++index] : true;
    } else return undefined;
  }
  const incrementBy = values.incrementBy === undefined ? 1 : Number(values.incrementBy);
  if (!Number.isSafeInteger(incrementBy) || incrementBy < 1 || incrementBy > 4096 || (values.ver !== undefined && !valid(values.ver))) return undefined;
  try {
    const release = validateOptions(values);
    return { ...release, patterns, incrementBy, exactVersion: values.ver === undefined ? undefined : valid(values.ver) || undefined, message: values.message, unmodified: Boolean(values.unmodified), unmerged: Boolean(values.unmerged), snapped: Boolean(values.snapped), skipAutoTag: Boolean(values.skipAutoTag) };
  } catch {
    return undefined;
  }
}
