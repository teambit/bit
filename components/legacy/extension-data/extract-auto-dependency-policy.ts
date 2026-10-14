import type { VariantPolicyConfigArr } from '@teambit/dependency-resolver';

/** Split legacy policy arrays in place without loading extension or component models. */
export function extractAutoDependencyPolicy(policy: any): VariantPolicyConfigArr | undefined {
  if (!policy) return undefined;
  const automatic: VariantPolicyConfigArr = {};
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!Array.isArray(policy[key])) continue;
    automatic[key] = policy[key].filter((dependency) => !dependency.force);
    policy[key] = policy[key].filter((dependency) => dependency.force);
    if (!policy[key].length) {
      delete policy[key];
      continue;
    }
    policy[key] = policy[key].reduce((result, dependency) => {
      result[dependency.name] = dependency.version;
      return result;
    }, {});
  }
  return automatic;
}
