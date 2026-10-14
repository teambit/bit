export type RustWorkspaceSnapOptions = {
  pattern?: string;
  message?: string;
  unmodified?: boolean;
  unmerged?: boolean;
  skipAutoSnap?: boolean;
};

/** Only ordinary snapshots: build, editors and hook-altering flags stay canonical. */
export function parseRustWorkspaceSnap(args: string[]): RustWorkspaceSnapOptions | undefined {
  if (args[0] !== 'snap') return undefined;
  const options: RustWorkspaceSnapOptions = {};
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index++) {
    const argument = args[index];
    const flag = argument === '-m' ? '--message' : argument === '-u' ? '--unmodified' : argument;
    if (!flag.startsWith('-')) {
      if (
        options.pattern !== undefined ||
        !flag ||
        flag.length > 4096 ||
        flag.includes('\0') ||
        flag.split(',').some((part) => part.trim().startsWith('$') || part.includes(' AND '))
      )
        return undefined;
      options.pattern = flag;
      continue;
    }
    if (seen.has(flag)) return undefined;
    seen.add(flag);
    if (flag === '--message') {
      const message = args[++index];
      if (message === undefined || message.startsWith('-')) return undefined;
      options.message = message;
    } else if (flag === '--unmodified') options.unmodified = true;
    else if (flag === '--unmerged') options.unmerged = true;
    else if (flag === '--skip-auto-snap') options.skipAutoSnap = true;
    else return undefined;
  }
  return options;
}
