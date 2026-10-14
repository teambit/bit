import { extractAutoDependencyPolicy } from '@teambit/legacy.extension-data/dist/extract-auto-dependency-policy.js';
const resolver = 'teambit.dependencies/dependency-resolver';
const fields = ['dependencies', 'devDependencies', 'peerDependencies'];

/** Pending config precedes component/model configuration, while bitmap remains first. */
export function resolvePolicyProjection(target: any, version: any) {
  if (!target.resolveConfig || target.mergedConfig === undefined) return { target, version };
  const merged = target.mergedConfig;
  if (
    !merged ||
    typeof merged !== 'object' ||
    Array.isArray(merged) ||
    Object.keys(merged).some((key) => key !== resolver)
  )
    throw new Error('resolve pending aspect configuration');
  if (!Object.hasOwn(merged, resolver)) return { target, version };
  const config = JSON.parse(JSON.stringify(merged[resolver]));
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).some((key) => key !== 'policy')
  )
    throw new Error('resolve pending resolver configuration');
  const policy = config.policy ?? {};
  if (
    !policy ||
    typeof policy !== 'object' ||
    Array.isArray(policy) ||
    Object.keys(policy).some((key) => !fields.includes(key))
  )
    throw new Error('resolve pending dependency policy');
  for (const value of Object.values(policy)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (
          !row ||
          typeof row !== 'object' ||
          Array.isArray(row) ||
          Object.keys(row).some((key) => !['name', 'version', 'force'].includes(key)) ||
          typeof row.name !== 'string' ||
          !row.name ||
          typeof row.version !== 'string' ||
          row.version === '-' ||
          (row.force !== undefined && typeof row.force !== 'boolean')
        )
          throw new Error('resolve pending policy row');
      }
    } else if (
      !value ||
      typeof value !== 'object' ||
      Object.values(value).some((entry) => typeof entry !== 'string' || entry === '-')
    )
      throw new Error('resolve pending policy map');
  }
  const automatic = extractAutoDependencyPolicy(policy);
  return {
    target: {
      ...target,
      mergedConfigNames: [resolver],
      autoDetectMergePolicy: fields.map((field) =>
        Object.fromEntries((automatic?.[field] ?? []).map((row) => [row.name, row.version]))
      ),
    },
    version: {
      ...version,
      extensions: [
        { ...version?.extensions?.find((row) => row.name === resolver), name: resolver, config },
        ...(version?.extensions ?? []).filter((row) => row.name !== resolver),
      ],
    },
  };
}
