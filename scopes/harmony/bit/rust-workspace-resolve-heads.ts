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
