export type RustWorkspaceOutboundOptions = {
  ids: string[];
  originDirectly: boolean;
};

/** Select ordinary scoped exports; Rust performs the final workspace/remote preflight. */
export function parseRustWorkspaceOutbound(args: string[]): RustWorkspaceOutboundOptions | undefined {
  if (args[0] !== 'export' && args[0] !== 'e') return undefined;
  const ids: string[] = [];
  let originDirectly = false;
  for (const arg of args.slice(1)) {
    if (arg === '--origin-directly') {
      if (originDirectly) return undefined;
      originDirectly = true;
    } else if (arg.startsWith('-')) {
      return undefined;
    } else {
      if (
        arg.length > 4096 ||
        arg.includes('\0') ||
        arg.includes('*') ||
        arg.includes('?') ||
        !/^[^/@\s]+\/.+(?:@[^@\s]+)?$/.test(arg) ||
        ids.length >= 4096
      )
        return undefined;
      ids.push(arg);
    }
  }
  return { ids, originDirectly };
}
