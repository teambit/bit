/** Optional head reads are native proof-bound. Null means an absent object, as
 * canonical ModelComponent issue callbacks treat a missing local head as false. */
export function ordinaryResolveIssueHeads(context: any, receipt: any): boolean {
  if (!Array.isArray(receipt) || receipt.length !== context.models.length) return false;
  return context.models.every((model: any, index: number) => {
    if (model.deprecated) return false;
    const identity = `${model.scope}/${model.name}`;
    const row = receipt[index];
    const lane = context.lane?.targets?.find((target: any) => target.identity === identity);
    const expected = [
      ...new Set([model.head, lane?.currentHead].filter((hash) => hash !== undefined && hash !== null)),
    ];
    if (!row || row.identity !== identity || !Array.isArray(row.heads) || row.heads.length !== expected.length)
      return false;
    return row.heads.every((head: any, headIndex: number) => {
      if (
        !head ||
        typeof head.hash !== 'string' ||
        !/^[a-f\d]{40}$/.test(head.hash) ||
        head.hash !== expected[headIndex]
      )
        return false;
      if (head.version === null) return true;
      const version = head.version;
      return (
        version &&
        typeof version === 'object' &&
        !Array.isArray(version) &&
        Array.isArray(version.extensions ?? []) &&
        !(version.extensions ?? []).some((extension: any) =>
          ['teambit.component/deprecation', 'teambit.component/remove'].includes(extension.name)
        )
      );
    });
  });
}

/** External snapshot issue vertices carry retained adjacency and a proven absent
 * local ModelComponent. Canonical removal/deprecation callbacks return false in
 * that case; cycle detection must still retain every reachable external edge. */
export function resolveExternalIssueVertices(
  components: { identity: string; dependencies: string[] }[],
  receipt: any
): { identity: string; dependencies: string[] }[] | undefined {
  const workspace = new Set(components.map((component) => component.identity));
  const requested = components.flatMap((component) => component.dependencies).filter((id) => !workspace.has(id));
  if (receipt === undefined) return requested.length ? undefined : [];
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    Array.isArray(receipt) ||
    Object.keys(receipt).some((key) => key !== 'external') ||
    !Array.isArray(receipt.external) ||
    receipt.external.length > 4096
  )
    return undefined;
  const external = new Map<string, { identity: string; dependencies: string[] }>();
  for (const row of receipt.external) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).some((key) => !['identity', 'dependencies', 'model'].includes(key)) ||
      !versionedIdentity(row.identity) ||
      workspace.has(row.identity) ||
      external.has(row.identity) ||
      row.model !== null ||
      !Array.isArray(row.dependencies) ||
      row.dependencies.some((id: any) => typeof id !== 'string' || (!workspace.has(id) && !versionedIdentity(id))) ||
      new Set(row.dependencies).size !== row.dependencies.length
    )
      return undefined;
    external.set(row.identity, { identity: row.identity, dependencies: row.dependencies });
  }
  const seen = new Set<string>();
  const pending = [...requested];
  let edges = 0;
  while (pending.length) {
    const id = pending.pop() as string;
    if (workspace.has(id) || seen.has(id)) continue;
    const row = external.get(id);
    if (!row) return undefined;
    seen.add(id);
    edges += row.dependencies.length;
    if (edges > 16384) return undefined;
    pending.push(...row.dependencies);
  }
  return seen.size === external.size ? [...external.values()] : undefined;
}

function versionedIdentity(value: any): value is string {
  return typeof value === 'string' && /^[^@\s]+\/[^@\s]+@[^@\s]+$/.test(value);
}
