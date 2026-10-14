export type RustWorkspaceResolveOptions = { pattern?: string; message?: string };

/** Resolve invokes ordinary snap; installation flags do not change that lifecycle. */
export function parseRustWorkspaceResolve(args: string[]): RustWorkspaceResolveOptions | undefined {
  if (args[0] !== 'merge') return undefined;
  const flags = new Set<string>();
  let pattern: string | undefined;
  let message: string | undefined;
  for (let index = 1; index < args.length; index++) {
    const value = args[index];
    const flag = value === '-m' ? '--message' : value === '-x' ? '--skip-dependency-installation' : value;
    if (!flag.startsWith('-')) {
      if (
        pattern !== undefined ||
        !flag ||
        flag.length > 4096 ||
        flag.includes('\0') ||
        flag.split(',').some((part) => part.trim().startsWith('$') || part.includes(' AND '))
      )
        return undefined;
      pattern = flag;
      continue;
    }
    if (flags.has(flag)) return undefined;
    flags.add(flag);
    if (flag === '--message') {
      message = args[++index];
      if (message === undefined || message.startsWith('-')) return undefined;
    } else if (flag !== '--resolve' && flag !== '--skip-dependency-installation') return undefined;
  }
  return flags.has('--resolve') ? { pattern, message } : undefined;
}
