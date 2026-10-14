import type { RustWorkspaceCommandOptions } from './rust-workspace-command-options';

export type RustWorkspaceLaneOptions = {
  name: string;
  noAutoSnap: boolean;
  noSquash: boolean;
  squash: boolean;
  skipFetch: boolean;
  includeDeps: boolean;
  workspaceOnly: boolean;
  excludeNonLaneComps: boolean;
};

/** Parse the supported lane grammar without bootstrapping the lane aspect. */
export function parseRustLaneCommand(args: string[]): RustWorkspaceCommandOptions | undefined {
  const aliases = { '-x': '--skip-dependency-installation', '-r': '--auto-merge-resolve', '-m': '--message' };
  const boolean = new Set([
    '--skip-dependency-installation',
    '--manual',
    '--verbose',
    '--no-auto-snap',
    '--no-snap',
    '--no-squash',
    '--squash',
    '--skip-fetch',
    '--include-deps',
    '--workspace',
    '--exclude-non-lane-comps',
  ]);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = aliases[args[index]] || args[index];
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    if (Object.hasOwn(flags, arg)) return undefined;
    if (boolean.has(arg)) flags[arg] = true;
    else if (arg === '--auto-merge-resolve' || arg === '--message' || arg === '--pattern') {
      const value = args[++index];
      if (!value || value.startsWith('-')) return undefined;
      flags[arg] = value;
    } else return undefined;
  }
  const [name, positionalPattern] = positionals;
  if (positionalPattern && flags['--pattern']) return undefined;
  const pattern = positionalPattern ?? (flags['--pattern'] as string | undefined);
  if (!flags['--skip-dependency-installation'] || positionals.length > 2 || !name) return undefined;
  if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/.test(name)) return undefined;
  if (
    pattern &&
    (pattern.length > 4096 || pattern.split(',').some((part) => part.trim().startsWith('$') || part.includes(' AND ')))
  )
    return undefined;
  if (flags['--manual'] && flags['--auto-merge-resolve']) return undefined;
  if (flags['--no-squash'] && flags['--squash']) return undefined;
  if (flags['--no-auto-snap'] && flags['--message']) return undefined;
  if (flags['--include-deps'] && !pattern && !flags['--workspace']) return undefined;
  const strategy = flags['--manual'] ? 'manual' : flags['--auto-merge-resolve'];
  if (strategy && !['ours', 'theirs', 'manual'].includes(String(strategy))) return undefined;
  return {
    operation: 'merge',
    lane: {
      name,
      noAutoSnap: flags['--no-auto-snap'] === true,
      noSquash: flags['--no-squash'] === true,
      squash: flags['--squash'] === true,
      skipFetch: flags['--skip-fetch'] === true,
      includeDeps: flags['--include-deps'] === true,
      workspaceOnly: flags['--workspace'] === true,
      excludeNonLaneComps: flags['--exclude-non-lane-comps'] === true,
    },
    pattern,
    strategy: strategy as RustWorkspaceCommandOptions['strategy'],
    noSnap: flags['--no-snap'] === true,
    message: flags['--message'] as string | undefined,
    verbose: flags['--verbose'] === true,
    skipDependencyInstallation: true,
  };
}
