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

export function isLegacyCoreEnv(envIdWithoutVersion: string): boolean {
  return LEGACY_CORE_ENVS_IDS_SET.has(envIdWithoutVersion);
}

export function getPinnedLegacyCoreEnvVersion(envIdWithoutVersion: string): string | undefined {
  return LEGACY_CORE_ENVS_VERSIONS[envIdWithoutVersion];
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
 * legacy core envs were published with the core-aspects package-name convention.
 * e.g. 'teambit.react/react' => '@teambit/react', 'teambit.harmony/node' => '@teambit/node'.
 */
export function getLegacyCoreEnvPackageName(envIdWithoutVersion: string): string {
  const [, ...name] = envIdWithoutVersion.split('/');
  return `@teambit/${name.join('.')}`;
}
