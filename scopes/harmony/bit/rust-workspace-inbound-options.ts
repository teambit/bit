export type RustWorkspaceInboundOptions = {
  operation: 'fetch' | 'import';
  ids: string[];
  objectsOnly: boolean;
  allHistory: boolean;
  fromOriginalScope: boolean;
  skipDependencyInstallation: boolean;
};

/** Ordinary inbound forms; Rust decides final eligibility before any workspace mutation. */
export function parseRustWorkspaceInbound(args: string[]): RustWorkspaceInboundOptions | undefined {
  const operation = args[0];
  if (operation !== 'fetch' && operation !== 'import') return undefined;
  const ids: string[] = [];
  const flags = new Set<string>();
  for (const arg of args.slice(1)) {
    if (arg.startsWith('-')) {
      if (flags.has(arg)) return undefined;
      flags.add(arg);
    } else {
      if (!arg || arg.length > 4096 || arg.includes('\0') || ids.length >= 4096) return undefined;
      ids.push(arg);
    }
  }
  if (operation === 'fetch') {
    const allowed = new Set(['--components', '-c', '--all-history']);
    if ([...flags].some((flag) => !allowed.has(flag))) return undefined;
    if (flags.has('--components') === flags.has('-c')) return undefined;
    return {
      operation,
      ids,
      objectsOnly: true,
      allHistory: flags.has('--all-history'),
      fromOriginalScope: false,
      skipDependencyInstallation: false,
    };
  }
  const allowed = new Set(['--objects', '-o', '--all-history', '--skip-dependency-installation', '-x']);
  if ([...flags].some((flag) => !allowed.has(flag))) return undefined;
  if (flags.has('--objects') && flags.has('-o')) return undefined;
  if (flags.has('--skip-dependency-installation') && flags.has('-x')) return undefined;
  const objectsOnly = !ids.length || flags.has('--objects') || flags.has('-o');
  const skipDependencyInstallation = flags.has('--skip-dependency-installation') || flags.has('-x');
  if (!objectsOnly && !skipDependencyInstallation) return undefined;
  return {
    operation,
    ids,
    objectsOnly,
    allHistory: flags.has('--all-history'),
    fromOriginalScope: false,
    skipDependencyInstallation,
  };
}
