/**
 * envs that used to be core aspects (bundled with the bit binary) and were removed from the core
 * to keep bit slim. because they were core aspects, old components (tagged before the removal)
 * have these envs saved in their models WITHOUT a version.
 * to keep such components working, when bit encounters one of these env-ids without a version, it
 * treats it as if it was configured with the pinned version listed below (installs it from the
 * registry and loads it as a regular external env).
 *
 * the pinned versions should be bumped when new versions of these envs are released.
 */
export const LEGACY_CORE_ENVS_VERSIONS: Record<string, string> = {
  'teambit.harmony/node': '1.0.1042',
  'teambit.react/react': '1.0.1042',
  'teambit.harmony/aspect': '1.0.1042',
  'teambit.envs/env': '1.0.1042',
  'teambit.mdx/mdx': '1.0.1043',
  'teambit.mdx/readme': '1.0.1043',
  'teambit.react/react-native': '1.0.491',
  'teambit.html/html': '1.0.509',
};

/**
 * envs that were removed from the core long ago and have no published package to pin.
 * listed here so they won't be reported as invalid config (external env without version).
 */
const OLDER_REMOVED_CORE_ENVS = ['teambit.harmony/bit-custom-aspect'];

const LEGACY_CORE_ENVS_IDS = [...Object.keys(LEGACY_CORE_ENVS_VERSIONS), ...OLDER_REMOVED_CORE_ENVS];
const LEGACY_CORE_ENVS_IDS_SET = new Set(LEGACY_CORE_ENVS_IDS);

export function getLegacyCoreEnvsIds(): string[] {
  // return a copy so callers can't mutate the module-level list
  return [...LEGACY_CORE_ENVS_IDS];
}

export function isLegacyCoreEnv(envId: string): boolean {
  // the id may carry a version (e.g. when coming from component config), strip it
  return LEGACY_CORE_ENVS_IDS_SET.has(envId.split('@')[0]);
}

export function getPinnedLegacyCoreEnvVersion(envId: string): string | undefined {
  return LEGACY_CORE_ENVS_VERSIONS[envId.split('@')[0]];
}

/**
 * for a legacy core env id without a version, return the id with the pinned version.
 * e.g. 'teambit.react/react' => 'teambit.react/react@1.0.1042'.
 * if the id already has a version or no pinned version exists, return it as-is.
 */
export function resolveLegacyCoreEnvId(envId: string): string {
  if (envId.includes('@')) return envId;
  const pinnedVersion = getPinnedLegacyCoreEnvVersion(envId);
  if (!pinnedVersion) return envId;
  return `${envId}@${pinnedVersion}`;
}

/**
 * key for tracking in-flight (currently loading) aspects, used to break circular load chains.
 * legacy core envs are single-instance so any version of them matches; other aspects are keyed
 * with their version - a nested chain may legitimately need a different version of an
 * already-loading aspect.
 */
export function aspectLoadInFlightKey(id: string): string {
  const idWithoutVersion = id.split('@')[0];
  return isLegacyCoreEnv(idWithoutVersion) ? idWithoutVersion : id;
}

/**
 * legacy core envs were published with the core-aspects package-name convention.
 * e.g. 'teambit.react/react' => '@teambit/react', 'teambit.harmony/node' => '@teambit/node'.
 */
export function getLegacyCoreEnvPackageName(envId: string): string {
  const [, ...name] = envId.split('@')[0].split('/');
  return `@teambit/${name.join('.')}`;
}

/**
 * structurally compatible with the dependency-resolver's EnvPolicyConfigObject (not imported to
 * avoid a dependency from envs on dependency-resolver).
 */
export type LegacyCoreEnvPolicy = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peers?: Array<{ name: string; version: string; supportedRange: string }>;
};

const REACT_ENV_POLICY: LegacyCoreEnvPolicy = {
  dependencies: { react: '-', 'react-dom': '-', 'core-js': '^3.0.0' },
  devDependencies: {
    react: '-',
    'react-dom': '-',
    '@types/mocha': '-',
    '@types/node': '12.20.4',
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    '@types/jest': '^26.0.0',
    '@babel/runtime': '7.20.0',
    '@types/testing-library__jest-dom': '5.9.5',
  },
  peerDependencies: {
    react: '^17.0.0 || ^18.0.0 || ^19.0.0',
    'react-dom': '^17.0.0 || ^18.0.0 || ^19.0.0',
  },
};

// like react, but @babel/runtime is a runtime dependency (aspects are compiled by babel)
const ASPECT_ENV_POLICY: LegacyCoreEnvPolicy = {
  dependencies: { react: '-', 'react-dom': '-', 'core-js': '^3.0.0', '@babel/runtime': '7.20.0' },
  devDependencies: {
    react: '-',
    'react-dom': '-',
    '@types/mocha': '-',
    '@types/node': '12.20.4',
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    '@types/jest': '^26.0.0',
    '@types/testing-library__jest-dom': '5.9.5',
  },
  peerDependencies: {
    react: '^17.0.0 || ^18.0.0 || ^19.0.0',
    'react-dom': '^17.0.0 || ^18.0.0 || ^19.0.0',
  },
};

const NODE_ENV_POLICY: LegacyCoreEnvPolicy = {
  devDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' },
  peers: [
    { name: 'react', version: '^19.0.0', supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0' },
    { name: 'react-dom', version: '^19.0.0', supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0' },
  ],
};

const MDX_ENV_POLICY: LegacyCoreEnvPolicy = {
  ...REACT_ENV_POLICY,
  dependencies: {
    ...REACT_ENV_POLICY.dependencies,
    '@teambit/mdx.ui.mdx-scope-context': '1.0.0',
    '@mdx-js/react': '^3.1.1',
  },
};

/**
 * the dependency policies (getDependencies) of the legacy core envs at their pinned versions.
 * these envs cannot always be loaded (their package is not necessarily installed, e.g. when
 * computing manifests for scope-aspects capsules), but since the pinned versions are immutable
 * their policies are known and embedded here (verified against the published packages).
 * the env env composes the aspect env and the readme env composes the mdx env, neither overrides
 * getDependencies - hence the shared objects.
 * react-native and html were removed from the core long before the other envs, their pinned
 * versions were built from older code - their policies are not embedded.
 */
const LEGACY_CORE_ENVS_POLICIES: Record<string, LegacyCoreEnvPolicy> = {
  'teambit.harmony/node': NODE_ENV_POLICY,
  'teambit.react/react': REACT_ENV_POLICY,
  'teambit.harmony/aspect': ASPECT_ENV_POLICY,
  'teambit.envs/env': ASPECT_ENV_POLICY,
  'teambit.mdx/mdx': MDX_ENV_POLICY,
  'teambit.mdx/readme': MDX_ENV_POLICY,
};

export function getLegacyCoreEnvPolicy(envId: string): LegacyCoreEnvPolicy | undefined {
  return LEGACY_CORE_ENVS_POLICIES[envId.split('@')[0]];
}
