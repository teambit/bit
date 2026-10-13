export type RustWorkspaceCommandOptions = {
  operation: 'checkout' | 'merge';
  to?: string;
  pattern?: string;
  all?: boolean;
  strategy?: 'ours' | 'theirs' | 'manual';
  forceOurs?: boolean;
  forceTheirs?: boolean;
  noSnap?: boolean;
  message?: string;
  verbose?: boolean;
  skipDependencyInstallation: true;
};

/** Only an unambiguous subset of the public CLI grammar reaches native planning. */
export function parseRustWorkspaceCommand(args: string[]): RustWorkspaceCommandOptions | undefined {
  const command = args[0];
  if (!['checkout', 'U', 'merge'].includes(command)) return undefined;
  const operation = command === 'merge' ? 'merge' : 'checkout';
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  const aliases = {
    '-x': '--skip-dependency-installation',
    '-r': '--auto-merge-resolve',
    ...(operation === 'checkout' ? { '-a': '--all', '-v': '--verbose' } : { '-m': '--message' }),
  };
  const boolean = new Set([
    '--skip-dependency-installation',
    '--manual',
    '--verbose',
    ...(operation === 'checkout' ? ['--all', '--force-ours', '--force-theirs'] : ['--no-snap']),
  ]);
  for (let i = 1; i < args.length; i++) {
    const arg = aliases[args[i]] || args[i];
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    if (Object.hasOwn(flags, arg)) return undefined;
    if (boolean.has(arg)) flags[arg] = true;
    else if (arg === '--auto-merge-resolve' || (operation === 'merge' && arg === '--message')) {
      const value = args[++i];
      if (!value || value.startsWith('-')) return undefined;
      flags[arg] = value;
    } else return undefined;
  }
  if (!flags['--skip-dependency-installation']) return undefined;
  if (flags['--manual'] && flags['--auto-merge-resolve']) return undefined;
  const strategy = flags['--manual'] ? 'manual' : flags['--auto-merge-resolve'];
  if (strategy && !['ours', 'theirs', 'manual'].includes(String(strategy))) return undefined;
  if (flags['--force-ours'] && flags['--force-theirs']) return undefined;
  if (flags['--no-snap'] && flags['--message']) return undefined;
  if (positionals.length > (operation === 'checkout' ? 2 : 1)) return undefined;
  const to = operation === 'checkout' ? positionals.shift() : undefined;
  if (
    operation === 'checkout' &&
    (!to ||
      !/^(?:head|latest|reset|main|head~[0-9]+|[a-f0-9]{40}|[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)$/.test(
        to
      ))
  )
    return undefined;
  if (flags['--all'] && (to === 'head' || to === 'latest')) return undefined;
  const pattern = positionals[0];
  if (pattern && !(operation === 'merge' && pattern === '**') && !/^[a-z0-9_./-]+$/.test(pattern))
    return undefined;
  return {
    operation,
    to,
    pattern,
    all: flags['--all'] === true,
    strategy: strategy as RustWorkspaceCommandOptions['strategy'],
    forceOurs: flags['--force-ours'] === true,
    forceTheirs: flags['--force-theirs'] === true,
    noSnap: flags['--no-snap'] === true,
    message: flags['--message'] as string | undefined,
    verbose: flags['--verbose'] === true,
    skipDependencyInstallation: true,
  };
}
