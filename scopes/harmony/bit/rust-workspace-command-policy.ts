import { normalizeSemverInputs, registerRustConfigSemver } from '@teambit/config-merger/dist/rust-config-operation.js';
import type { NativeClientRequest } from './rust-client-capture';
import type { FreshDependencyCache } from './rust-fresh-dependencies';
import { freshDependencyDetection } from './rust-fresh-dependencies';
import { statusPolicy, dependencyGrammar } from './rust-status-policy';
import { commandDefaultNodeReceipt } from './rust-workspace-command-defaults';

registerRustConfigSemver();

function grammar(values: any) {
  const strings = new Set<string>();
  const visit = (value: any) => {
    if (typeof value === 'string') strings.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(values);
  const result = normalizeSemverInputs(strings);
  if (!result) throw new Error('command configuration grammar');
  return result;
}

function targets(value: any, context: any): any[] {
  if (!Array.isArray(value) || !value.length || value.length > context.targets.length)
    throw new Error('command dependency target receipt');
  const seen = new Set<string>();
  for (const target of value) {
    if (
      typeof target.identity !== 'string' ||
      seen.has(target.identity) ||
      !context.targets.some(
        (original) => original.identity === target.identity && original.directory === target.directory
      ) ||
      !Array.isArray(target.files) ||
      target.files.length > 4096 ||
      target.files.some((file) => typeof file !== 'string')
    )
      throw new Error('command dependency target receipt');
    seen.add(target.identity);
  }
  return value;
}

export async function prepareRustCommandPolicy(
  prepared: any,
  plan: any,
  dependencyStates: Map<string, any>,
  request: NativeClientRequest
): Promise<{ plan: any; dependencyCaches: FreshDependencyCache[] }> {
  const original = {
    ...prepared.context,
    targets: [
      ...prepared.context.targets,
      ...(prepared.context.lane?.inactiveTargets ?? []),
      ...(prepared.context.lane?.addedTargets ?? []),
    ],
  };
  const rows = targets(plan.policyPreparation.targets, original);
  const components = rows.map((row) => {
    if (
      prepared.context.lane?.addedTargets?.some((target: any) => target.identity === row.identity) &&
      !row.fastForward
    )
      throw new Error('command new component policy requires incoming projection');
    const target = original.targets.find((entry) => entry.identity === row.identity);
    const policy = statusPolicy(original, target, row.fastForward ? row.otherVersion : undefined);
    const defaultNode = commandDefaultNodeReceipt(target, policy, row.files);
    return {
      identity: row.identity,
      defaultNode,
      semver: grammar([row, defaultNode]),
      dependencyState: row.fastForward ? undefined : dependencyStates.get(row.identity),
    };
  });
  const policyPlan = await request({ kind: 'commandPolicyPrepare', token: prepared.token, components });
  if (policyPlan.token !== prepared.token) throw new Error('command configuration receipt');
  if (!policyPlan.dependencyPreparation) return { plan: { ...plan, ...policyPlan }, dependencyCaches: [] };
  const context = policyPlan.dependencyPreparation.context;
  const projected = targets(policyPlan.dependencyPreparation.targets, original);
  const inputs = projected.map((target) => {
    const policy = statusPolicy(context, target, target.projectedVersion);
    return { target, policy, defaultNode: commandDefaultNodeReceipt(target, policy, target.files) };
  });
  const detected = await request({
    kind: 'commandDependencyDetect',
    token: prepared.token,
    components: inputs.map(({ target, policy }) => ({
      identity: target.identity,
      detection: freshDependencyDetection(context, target.files, policy),
    })),
  });
  if (
    detected.token !== prepared.token ||
    !Array.isArray(detected.components) ||
    detected.components.length !== inputs.length
  )
    throw new Error('command detected dependency receipt');
  const completed = await request({
    kind: 'commandDependencyComplete',
    token: prepared.token,
    components: inputs.map(({ target, policy, defaultNode }, index) => {
      const capture = detected.components[index];
      if (capture.identity !== target.identity) throw new Error('command dependency capture order');
      return {
        identity: target.identity,
        defaultNode,
        ...policy.input,
        resolution: { ...policy.input.resolution, grammar: dependencyGrammar([policy.input, capture.grammarInputs]) },
      };
    }),
  });
  if (completed.token !== prepared.token) throw new Error('command dependency completion receipt');
  const cacheTargets =
    completed.snapFailed === true
      ? projected.filter((target) => rows.some((row) => row.identity === target.identity && !row.fastForward))
      : projected;
  validateCaches(completed.dependencyCaches, cacheTargets);
  validateIssueTargets(completed.issueTargets, projected);
  return { plan: { ...plan, ...completed }, dependencyCaches: completed.dependencyCaches };
}

function validateIssueTargets(components: any, projected: any[]) {
  if (!Array.isArray(components) || components.length !== projected.length)
    throw new Error('command issue target receipt');
  for (const [index, component] of components.entries()) {
    const target = projected[index];
    if (
      component.identity !== `${target.identity}@${target.version}` ||
      typeof component.packageName !== 'string' ||
      !Array.isArray(component.dependencies) ||
      component.dependencies.some((identity) => typeof identity !== 'string') ||
      !Array.isArray(component.issues)
    )
      throw new Error('command issue target receipt');
  }
}

function validateCaches(caches: any, projected: any[]) {
  if (!Array.isArray(caches) || caches.length !== projected.length) throw new Error('command dependency cache receipt');
  for (const [index, cache] of caches.entries()) {
    const target = projected[index];
    if (
      cache.identity !== `${target.identity}@${target.version}` ||
      typeof cache.rawData !== 'string' ||
      typeof cache.cacheable !== 'boolean' ||
      !Array.isArray(cache.readSet)
    )
      throw new Error('command dependency cache receipt');
  }
}
