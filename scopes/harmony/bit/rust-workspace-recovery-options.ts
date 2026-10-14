export type RustRecoveryOptions = {
  operation: 'componentAbort' | 'laneAbort';
  pattern?: string;
  silent?: true;
  verbose?: boolean;
  skipDependencyInstallation: true;
};

export function parseRustWorkspaceRecovery(args: string[]): RustRecoveryOptions | undefined {
  const lane = args[0] === 'lane' && args[1] === 'merge-abort';
  if (!lane && args[0] !== 'merge') return undefined;
  const flags = new Set<string>();
  const positionals: string[] = [];
  const aliases = { '-x': '--skip-dependency-installation', ...(lane ? { '-s': '--silent' } : {}) };
  const allowed = new Set(
    lane ? ['--skip-dependency-installation', '--silent', '--verbose'] : ['--skip-dependency-installation', '--abort']
  );
  for (const input of args.slice(lane ? 2 : 1)) {
    const arg = aliases[input] || input;
    if (!arg.startsWith('-')) positionals.push(arg);
    else {
      if (!allowed.has(arg) || flags.has(arg)) return undefined;
      flags.add(arg);
    }
  }
  if (!flags.has('--skip-dependency-installation') || !flags.has(lane ? '--silent' : '--abort')) return undefined;
  if (positionals.length > (lane ? 0 : 1)) return undefined;
  const pattern = positionals[0];
  if (pattern && pattern !== '**' && !/^[a-z0-9_./-]+$/.test(pattern)) return undefined;
  return {
    operation: lane ? 'laneAbort' : 'componentAbort',
    skipDependencyInstallation: true,
    ...(pattern && { pattern }),
    ...(lane && { silent: true as const, verbose: flags.has('--verbose') }),
  };
}
