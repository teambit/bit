import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { statusPolicy } from './rust-status-policy';
import { commandDefaultNodeReceipt } from './rust-workspace-command-defaults';
import { splitComponentPatterns, matchComponentPatterns } from '@teambit/scope/dist/component-id-patterns.js';
import { collectRustStatusIssues } from './rust-status-issues';
import type { captureRustClientCurrent } from './rust-client-capture';

type Capture = NonNullable<Awaited<ReturnType<typeof captureRustClientCurrent>>>;

export function resolveComponentReceipts(context: any, capture: Capture) {
  return capture.captured.map((component) => {
    const target = context.targets.find((row: any) => row.identity === component.identity);
    if (!target || !capture.dependencyStates.has(component.identity)) throw new Error('resolve component metadata');
    const policy = statusPolicy(context, target);
    return {
      identity: component.identity,
      extensions: policy.extensions,
      packageName: policy.packageName,
      defaultNode: commandDefaultNodeReceipt(target, policy, component.files),
      dependencyState: capture.dependencyStates.get(component.identity),
    };
  });
}

export function resolveSemver(context: any, capture: Capture) {
  const versions = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.version === 'string') versions.add(value.version);
    if (typeof value.identity === 'string' && value.identity.includes('@'))
      versions.add(value.identity.slice(value.identity.lastIndexOf('@') + 1));
    for (const child of Object.values(value)) visit(child);
  };
  for (const model of context.models) {
    for (const version of [...Object.keys(model.versions ?? {}), ...Object.keys(model.orphanedVersions ?? {})])
      versions.add(version);
  }
  visit(context.versions);
  visit(capture.captured);
  visit([...capture.dependencyStates.values()]);
  return snapshotSemverGrammar(versions);
}

export async function validateResolveIssues(
  root: string,
  context: any,
  capture: Capture,
  identities: string[],
  issueGraph?: any
) {
  if (!Array.isArray(context.resolveIssueHeads)) throw new Error('resolve issue head proof receipt absent');
  const issues = await collectRustStatusIssues(
    root,
    context,
    capture.components,
    context.resolveIssueHeads,
    issueGraph
  );
  if (!issues) throw new Error('resolve issue callback requires canonical loading');
  const selected = new Set(identities);
  if (issues.some((component) => selected.has(component.id) && component.issues.some((issue) => issue.isTagBlocker)))
    throw new Error('resolve snapshot issues');
}

export function resolvePatternIds(context: any, pattern?: string): string[] | undefined {
  if (pattern === undefined) return undefined;
  const patterns = splitComponentPatterns(pattern);
  if (patterns.some((entry) => entry.startsWith('$') || entry.includes(' AND ')))
    throw new Error('resolve state selector requires canonical callbacks');
  const identities = context.targets.map((target: any) => target.identity);
  if (new Set(identities).size !== identities.length) throw new Error('resolve duplicate workspace identity');
  const selected = matchComponentPatterns(identities, patterns);
  if (!selected.length) throw new Error('resolve pattern has no matches');
  return selected;
}
