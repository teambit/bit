export type RustWorkspaceOutboundOptions = {
  ids: string[];
  originDirectly: boolean;
  resume?: string;
};

/** Select ordinary scoped exports; Rust performs the final workspace/remote preflight. */
export function parseRustWorkspaceOutbound(args: string[]): RustWorkspaceOutboundOptions | undefined {
  if (args[0] !== 'export' && args[0] !== 'e') return undefined;
  const ids: string[] = [];
  let originDirectly = false;
  let resume: string | undefined;
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--origin-directly') {
      if (originDirectly) return undefined;
      originDirectly = true;
    } else if (arg === '--resume') {
      const clientId = args[++index];
      if (resume || !clientId || clientId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(clientId)) return undefined;
      resume = clientId;
    } else if (arg.startsWith('-')) {
      return undefined;
    } else {
      if (
        arg.length > 4096 ||
        arg.includes('\0') ||
        arg.includes('*') ||
        arg.includes('?') ||
        !/^[^/@\s]+(?:\/[^@\s]+)?(?:@[^@\s]+)?$/.test(arg) ||
        ids.length >= 4096
      )
        return undefined;
      ids.push(arg);
    }
  }
  return { ids, originDirectly, ...(resume ? { resume } : {}) };
}
