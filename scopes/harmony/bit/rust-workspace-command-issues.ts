import { collectRustStatusIssues } from './rust-status-issues';

/** Check built-in snapshot blockers against the projected workspace graph before publication. */
export async function validateRustCommandIssues(root: string, context: any, components: any[], plan: any) {
  const projected = plan.issueTargets ?? [];
  if (!Array.isArray(projected) || (plan.policyPreparation && !projected.length))
    throw new Error('command issue targets absent');
  const { merged, additions } = projectedIssueComponents(components, plan, context);
  const issues = await collectRustStatusIssues(
    root,
    { ...context, targets: [...context.targets, ...additions] },
    merged
  );
  if (!issues) throw new Error('command issue callback requires canonical loading');
  const selected = new Set<string>(
    plan.policyPreparation
      ? plan.policyPreparation.targets.filter((target) => !target.fastForward).map((target) => target.identity)
      : plan.needsSnap
  );
  const errors = plan.snapFailed ? plan.result.mergeSnapError.components : [];
  for (const component of issues) {
    if (!selected.has(component.id)) continue;
    const actual = component.issues
      .filter((issue) => issue.isTagBlocker)
      .map((issue) => ({ type: issue.type, data: JSON.stringify(issue.data) }));
    const expected = errors.find((entry) => entry.id.split('@')[0] === component.id)?.issues ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('command unsupported snapshot issue');
  }
}

/** Prospective roots are native-proven metadata; they cannot be captured from disk before publication. */
function projectedIssueComponents(components: any[], plan: any, context: any) {
  const originals = new Set(components.map((component) => component.identity.split('@')[0]));
  const replacements = new Map<string, any>();
  const added: any[] = [];
  const additions: any[] = [];
  for (const component of plan.issueTargets ?? []) {
    const identity = component.identity?.split('@')[0];
    if (!identity || replacements.has(identity)) throw new Error('command issue target identity');
    if (!originals.has(identity)) {
      const target = context?.lane?.addedTargets?.find((row: any) => row.identity === identity);
      const selected = plan.policyPreparation?.targets.find((row: any) => row.identity === identity);
      if (!target || !selected?.fastForward || component.identity !== `${identity}@${target.version}`)
        throw new Error('command issue target identity');
      added.push(component);
      additions.push(target);
    }
    replacements.set(identity, component);
  }
  return {
    merged: [
      ...components.map((component) => replacements.get(component.identity.split('@')[0]) ?? component),
      ...added,
    ],
    additions,
  };
}

/** Snapshot issue checks reload exact workspace dependency IDs after cache reset. */
export function rustCommandSnapshotCacheClosure(components: any[], plan: any, context?: any): ReadonlySet<string> {
  const { merged: rows } = projectedIssueComponents(components, plan, context);
  const workspace = new Map<string, any>(rows.map((component) => [component.identity, component]));
  const queue: string[] = (plan.result?.mergeSnapError?.components ?? []).map((component) => component.id);
  // Every divergent seeder is loaded before issue checks, including nonblocking components.
  for (const target of plan.policyPreparation?.targets ?? []) {
    if (target.fastForward) continue;
    const component = rows.find((row) => row.identity.split('@')[0] === target.identity);
    if (!component) throw new Error('command failed-snap cache seeder absent');
    queue.push(component.identity);
  }
  const reached = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const identity = queue[index];
    const component = workspace.get(identity);
    if (!component || reached.has(identity)) continue;
    reached.add(identity);
    queue.push(...component.dependencies);
  }
  return reached;
}

/** Detecting a prospective component does not itself populate the canonical disk cache. */
export function rustCommandAddedSnapshotCaches<T extends { identity: string }>(
  caches: T[],
  context: any,
  reached: ReadonlySet<string>
): T[] {
  const added = new Set((context.lane?.addedTargets ?? []).map((target: any) => target.identity));
  return caches.filter((entry) => !added.has(entry.identity.split('@')[0]) || reached.has(entry.identity));
}
