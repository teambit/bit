import { EnvPolicy } from '@teambit/dependency-resolver/dist/policy/env-policy/env-policy.js';
import { VariantPolicy } from '@teambit/dependency-resolver/dist/policy/variant-policy/variant-policy.js';
import { getNodeDependencyPolicy } from '@teambit/node/dist/default-dependency-policy.js';
import { NODE_ENV_ICON, getNodeEnvDescriptor, getNodePreviewConfig } from '@teambit/node/dist/default-load-data.js';
import { getCjsPackageJsonProps } from '@teambit/typescript/dist/cjs-package-json-props.js';
import { CORE_ENV_PREVIEW_CAPABILITIES, coreEnvDoesScaling } from '@teambit/preview/dist/core-env-preview-data.js';
import { DEFAULT_SCHEMA_DISABLED } from '@teambit/schema/dist/default-load-data.js';
import { defaultTestPatterns } from '@teambit/tester/dist/default-dev-patterns.js';
import { defaultDocsPatterns } from '@teambit/docs/dist/default-dev-patterns.js';
import { defaultCompositionsPatterns } from '@teambit/compositions/dist/default-dev-patterns.js';
import { matchPatterns, splitPatterns } from '@teambit/toolbox.path.match-patterns';

/** Receipts for built-in environment callbacks; Rust constructs component metadata. */
export function commandDefaultNodeReceipt(target: any, policy: any, files: string[]) {
  const env = 'teambit.harmony/node';
  if (target.identity === env) throw new Error('command environment component');
  const devPatterns = {
    config: [] as string[],
    'teambit.defender/tester': defaultTestPatterns(),
    'teambit.compositions/compositions': defaultCompositionsPatterns(),
    'teambit.docs/docs': defaultDocsPatterns(),
    [env]: [] as string[],
  };
  const devFiles = Object.fromEntries(
    Object.entries(devPatterns).map(([name, patterns]) => {
      const { includePatterns, excludePatterns } = splitPatterns(patterns);
      return [name, files.filter((file) => matchPatterns(file, includePatterns, excludePatterns))];
    })
  );
  if (
    devFiles['teambit.compositions/compositions'].length ||
    devFiles['teambit.docs/docs'].length ||
    files.some((file) => /\.(?:bit-app|node-app|react-app)\.[^/]+$/.test(file))
  )
    throw new Error('command configured source callbacks');
  const componentPolicy =
    policy.extensions.find((extension) => extension.name === 'teambit.dependencies/dependency-resolver')?.config
      .policy ?? {};
  const policyEntries = VariantPolicy.mergePolices([
    EnvPolicy.fromConfigObject(getNodeDependencyPolicy()),
    VariantPolicy.fromConfigObject(componentPolicy, { source: 'config' }),
  ]).serialize();
  const preview = getNodePreviewConfig();
  return {
    env: { id: env, data: { ...getNodeEnvDescriptor(), id: env, icon: NODE_ENV_ICON } },
    policyEntries,
    componentRangePrefix: policy.input.resolution.prefix ?? null,
    devPatterns,
    devFiles,
    slotData: [
      { id: 'teambit.semantics/schema', data: { disabled: DEFAULT_SCHEMA_DISABLED }, undefinedKeys: [] },
      { id: 'teambit.pkg/pkg', data: { packageJsonModification: getCjsPackageJsonProps() }, undefinedKeys: [] },
      {
        id: 'teambit.preview/preview',
        data: {
          doesScaling: coreEnvDoesScaling(!target.version, preview.strategyName !== 'component'),
          ...CORE_ENV_PREVIEW_CAPABILITIES,
          ...preview,
        },
        undefinedKeys: [],
      },
      { id: 'teambit.compositions/compositions', data: { compositions: [] }, undefinedKeys: [] },
      { id: 'teambit.docs/docs', data: {}, undefinedKeys: ['doc'] },
    ],
  };
}
