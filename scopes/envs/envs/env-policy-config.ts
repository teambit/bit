// the shape of the dependency policies in the config files (workspace.jsonc variants, env.jsonc).

/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type SemverVersion = string;

export type PolicyConfigKeys = {
  dependencies: 'dependencies';
  devDependencies: 'devDependencies';
  peerDependencies: 'peerDependencies';
};

export type PolicyConfigKeysNames = keyof PolicyConfigKeys;

export type VariantPolicyConfigObject = Partial<Record<keyof PolicyConfigKeys, VariantPolicyLifecycleConfigObject>>;

type VariantPolicyLifecycleConfigObject = {
  [dependencyId: string]: VariantPolicyConfigEntryValue;
};

export type VariantPolicyLifecycleConfigEntryObject = {
  name: string;
  version: string;
  /**
   * hide the dependency from the component's package.json / dependencies list
   */
  hidden?: boolean;
  /**
   * force add to component dependencies even if it's not used by the component.
   */
  force?: boolean;
  optional?: boolean;
};

export type VariantPolicyConfigEntryValue = VariantPolicyEntryValue | VariantPolicyEntryVersion;

/**
 * Allowed values are valid semver values, git urls, fs path.
 */
export type VariantPolicyEntryVersion = SemverVersion;

export type VariantPolicyEntryValue = {
  version: VariantPolicyEntryVersion;
  resolveFromEnv?: boolean;
  optional?: boolean;
  workspaceSingleton?: boolean;
  override?: boolean;
};

export type EnvJsoncPolicyEntry = VariantPolicyLifecycleConfigEntryObject;

export type EnvJsoncPolicyPeerEntry = EnvJsoncPolicyEntry & {
  supportedRange: string;
  /**
   * When true, this peer dependency will be resolved as a single version at the workspace root,
   * even if different envs specify different versions. Useful for @types packages and workspace-level
   * tools (eslint, prettier) that must resolve from the workspace root.
   * When false (default), conflicts are resolved per-component via env roots.
   */
  workspaceSingleton?: boolean;
  /**
   * When true, generates a pnpm override for this peer using its version,
   * forcing all transitive dependencies to use the same version.
   * Useful to prevent old versions from being pulled by published packages.
   */
  override?: boolean;
};

export type VersionKeyName = 'version' | 'supportedRange';

export type EnvJsoncPolicyConfigKey = 'peers' | 'dev' | 'runtime';

export type EnvPolicyEnvJsoncConfigObject = {
  peers?: EnvJsoncPolicyPeerEntry[];
  dev?: EnvJsoncPolicyEntry[];
  runtime?: EnvJsoncPolicyEntry[];
};

/**
 * Config that is used before the new env.jsonc format was introduced.
 */
export type EnvPolicyLegacyConfigObject = Pick<EnvPolicyEnvJsoncConfigObject, 'peers'> & VariantPolicyConfigObject;

export type EnvPolicyConfigObject = EnvPolicyEnvJsoncConfigObject | EnvPolicyLegacyConfigObject;
