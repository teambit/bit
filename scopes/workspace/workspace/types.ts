interface VendorConfig {
  directory: string;
}

export interface WorkspaceExtConfig {
  /**
   * name of the workspace.
   */
  name: string;

  /**
   * path to icon.
   */
  icon: string;

  /**
   * set the default scope when there is no matching for the component in the components array.
   */
  defaultScope: string;

  /**
   * set the default directory when there is no matching for the component in the components array.
   */
  defaultDirectory: string;

  /**
   * sets the location of the root components directory.
   * The location is a relative path to the workspace root and should use linux path separators (/).
   */
  rootComponentsDirectory?: string;

  /**
   * set the default structure of components in your project
   */
  vendor: VendorConfig;

  /**
   * All component extensions applied by default on all components in the workspace (except vendor components)
   */
  extensions: { [extensionsId: string]: string };

  /**
   * If set to
   * `true`, it allows the workspace to resolve scope's aspects from node modules
   * installed in the workspace's `node_modules` directory. If not set or set to `false`, aspects will only be resolved
   * from the scope aspects capsule.
   */
  resolveAspectsFromNodeModules?: boolean;

  /**
   * If set to `true`, it allows the workspace to resolve envs from node modules
   * installed in the workspace's `node_modules` directory.
   * the envs will be resolved from the node_modules of the env's root (workspace/node_modules/.bit_roots/{envId})
   * and if not found (usually when the env was hoisted to the root node_modules) then from the node_modules of the
   * workspace.
   * If not set or set to `false`, envs will only be resolved from the scope envs capsule.
   */
  resolveEnvsFromRoots?: boolean;

  /**
   * If set to `true`, bit will try to load aspects dependencies automatically.
   * even if the aspects dependencies are not configured in the workspace.jsonc root config.
   * for example having the aspect
   * main aspect
   * export class MainAspectMain {
   *  ...
   *   static dependencies = [MyDepAspect];
   * }
   * and the in the workspace.jsonc file:
   * {
   *  ...
   *   main-aspect: {}
   * }
   * when set to true, bit will try to load MyDepAspect automatically.
   */
  autoLoadAspectsDeps?: boolean;

  /**
   * If set to `true`, enables external package manager mode. When enabled:
   * - `bit install` will not install dependencies and will prompt the user to use their package manager.
   * - Other commands that trigger installation (e.g., `bit import`, `bit checkout`) will skip the installation and print a warning.
   * When this prop is set by bit to `true`, the following properties are automatically set to `false`:
   * - `rootComponent`.
   * - `enableWorkspaceConfigWrite`.
   */
  externalPackageManager?: boolean;

  /**
   * List of file patterns to ignore from all components in the workspace.
   * Uses gitignore syntax.
   * Example: ["oxlint.config.json", "biome.json", "*.bak"]
   */
  ignoredFiles?: string[];

  /**
   * Scope-name patterns that the workspace trusts when loading aspects (envs,
   * generators, etc.) imported from those scopes. The effective trust set is:
   * a builtin set (e.g. `teambit.*`, `bitdev.*`) + the owner of `defaultScope`
   * (e.g. `acme.frontend` → `acme.*`) + entries listed here.
   *
   * Patterns: exact (`acme.frontend`) or owner wildcard (`acme.*`).
   * Manage via `bit scope trust [enable|disable|add|remove] [pattern]`.
   */
  trustedScopes?: string[];

  /**
   * If set to `true`, Bit auto-syncs the local `.bitmap` to the latest scope HEAD versions
   * whenever the git HEAD has moved since the last sync (sentinel-driven, runs once per
   * `git pull`). Designed for repos with strict branch-protection rules: combined with
   * `bit ci merge --no-bitmap-commit`, the CI never commits `.bitmap` to the default
   * branch — every developer's first Bit command after `git pull` reconciles their
   * local `.bitmap` with the latest exported scope versions automatically.
   *
   * The mechanism is a no-op when:
   * - the workspace is not inside a git repo,
   * - the workspace is on a lane (lanes have their own sync flow),
   * - git HEAD is unchanged since the last successful reconciliation.
   *
   * On a failed remote-scope fetch, the command continues with the cached `.bitmap`
   * state and the sentinel is NOT advanced, so the next command retries.
   */
  bitmapAutoSync?: boolean;
}
