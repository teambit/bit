import { collectRustStatusIssues } from './rust-status-issues';

/** Check built-in snapshot blockers against the projected workspace graph before publication. */
export async function validateRustCommandIssues(root: string, context: any, components: any[], plan: any) {
  const projected = plan.issueTargets ?? [];
  if (!Array.isArray(projected) || (plan.policyPreparation && !projected.length))
    throw new Error('command issue targets absent');
  const replacements = new Map<string, any>();
  for (const component of projected) {
    const identity = component.identity?.split('@')[0];
    if (
      !identity ||
      replacements.has(identity) ||
      !components.some((original) => original.identity.split('@')[0] === identity)
    )
      throw new Error('command issue target identity');
    replacements.set(identity, component);
  }
  const merged = components.map((component) => replacements.get(component.identity.split('@')[0]) ?? component);
  const issues = await collectRustStatusIssues(root, context, merged);
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
