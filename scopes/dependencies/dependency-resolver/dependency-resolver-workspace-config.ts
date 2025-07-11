import { PeerDependencyRules } from '@pnpm/types';
import { WorkspacePolicyConfigObject } from './policy';
import { PackageImportMethod } from './package-manager';

export type NodeLinker = 'hoisted' | 'isolated';

export type ComponentRangePrefix = '~' | '^' | '+' | '-';

export interface DependencyResolverWorkspaceConfig {
  policy: WorkspacePolicyConfigObject;
  /**
   * choose the package manager for Bit to use. you can choose between 'npm', 'yarn', 'pnpm'
   * and 'librarian'. our recommendation is use 'librarian' which reduces package duplicates
   * and totally removes the need of a 'node_modules' directory in your project.
   */
  packageManager?: string;

  /**
   * A proxy server for out going network requests by the package manager
   * Used for both http and https requests (unless the httpsProxy is defined)
   */
  proxy?: string;

  /**
   * A proxy server for outgoing https requests by the package manager (fallback to proxy server if not defined)
   * Use this in case you want different proxy for http and https requests.
   */
  httpsProxy?: string;

  /**
   * A path to a file containing one or multiple Certificate Authority signing certificates.
   * allows for multiple CA's, as well as for the CA information to be stored in a file on disk.
   */
  ca?: string;

  /**
   * Whether or not to do SSL key validation when making requests to the registry via https
   */
  strictSsl?: string;

  /**
   * A client certificate to pass when accessing the registry. Values should be in PEM format (Windows calls it "Base-64 encoded X.509 (.CER)") with newlines replaced by the string "\n". For example:
   * cert="----BEGIN CERTIFICATE-----\nXXXX\nXXXX\n-----END CERTIFICATE----"
   * It is not the path to a certificate file (and there is no "certfile" option).
   */
  cert?: string;

  /**
   * A client key to pass when accessing the registry. Values should be in PEM format with newlines replaced by the string "\n". For example:
   * key="----BEGIN PRIVATE KEY-----\nXXXX\nXXXX\n-----END PRIVATE KEY----"
   * It is not the path to a key file (and there is no "keyfile" option).
   */
  key?: string;

  /**
   * A comma-separated string of domain extensions that a proxy should not be used for.
   */
  noProxy?: string;

  /**
   * The IP address of the local interface to use when making connections to the npm registry.
   */
  localAddress?: string;

  /**
   * How many times to retry if Bit fails to fetch from the registry.
   */
  fetchRetries?: number;

  /*
   * The exponential factor for retry backoff.
   */
  fetchRetryFactor?: number;

  /*
   * The minimum (base) timeout for retrying requests.
   */
  fetchRetryMintimeout?: number;

  /*
   * The maximum fallback timeout to ensure the retry factor does not make requests too long.
   */
  fetchRetryMaxtimeout?: number;

  /*
   * The maximum amount of time (in milliseconds) to wait for HTTP requests to complete.
   */
  fetchTimeout?: number;

  /*
   * The maximum number of connections to use per origin (protocol/host/port combination).
   */
  maxSockets?: number;

  /*
   * Controls the maximum number of HTTP(S) requests to process simultaneously.
   */
  networkConcurrency?: number;

  /*
   * Set the prefix to use when adding dependency to workspace.jsonc via bit install
   * to lock version to exact version you can use empty string (default)
   */
  savePrefix?: string;

  /*
   * in case you want to disable this proxy set this config to false
   *
   */
  installFromBitDevRegistry?: boolean;

  /*
   * map of extra arguments to pass to the configured package manager upon the installation
   * of dependencies.
   */
  packageManagerArgs?: string[];

  /*
   * This field allows to instruct the package manager to override any dependency in the dependency graph.
   * This is useful to enforce all your packages to use a single version of a dependency, backport a fix,
   * or replace a dependency with a fork.
   */
  overrides?: Record<string, string>;

  /**
   * This is similar to overrides, but will only affect installation in capsules.
   * In case overrides is configured and this not, the regular overrides will affect capsules as well.
   * in case both configured, capsulesOverrides will be used for capsules, and overrides will affect the workspace.
   */
  capsulesOverrides?: Record<string, string>;

  /*
   * Defines what linker should be used for installing Node.js packages.
   * Supported values are hoisted and isolated.
   */
  nodeLinker?: NodeLinker;

  /*
   * Controls the way packages are imported from the store.
   */
  packageImportMethod?: PackageImportMethod;

  /*
   * Use and cache the results of (pre/post)install hooks.
   */
  sideEffectsCache?: boolean;

  /*
   * The list of components that should be installed in isolation from the workspace.
   * The component's package names should be used in this list, not their component IDs.
   */
  rootComponents?: boolean;

  /*
   * The node version to use when checking a package's engines setting.
   */
  nodeVersion?: string;

  /*
   * Refuse to install any package that claims to not be compatible with the current Node.js version.
   */
  engineStrict?: boolean;

  /*
   * Rules to mute specific peer dependeny warnings.
   */
  peerDependencyRules?: PeerDependencyRules;

  /*
   * This setting is "true" by default and tells bit to link core aspects to the node_modules of the workspace.
   * It only makes sense to set this to "false" in a workspace in which core aspects are actually developed.
   */
  linkCoreAspects?: boolean;

  /**
   * When false, Bit will create a shared node_modules directory for all components in a capsule.
   */
  isolatedCapsules?: boolean;

  /*
   * Ignore the builds of specific dependencies. The "preinstall", "install", and "postinstall" scripts
   * of the listed packages will not be executed during installation.
   */
  neverBuiltDependencies?: string[];

  /**
   * If true, staleness checks for cached data will be bypassed, but missing data will be requested from the server.
   */
  preferOffline?: boolean;

  /**
   * When true, components in capsules are symlinked into their own node_modules.
   */
  capsuleSelfReference?: boolean;

  /**
   * Tells pnpm which packages should be hoisted to node_modules/.pnpm/node_modules.
   * By default, all packages are hoisted - however, if you know that only some flawed packages have phantom dependencies,
   * you can use this option to exclusively hoist the phantom dependencies (recommended).
   */
  hoistPatterns?: string[];

  /**
   * When true, dependencies from the workspace are hoisted to node_modules/.pnpm/node_modules
   * even if they are found in the root node_modules
   */
  hoistInjectedDependencies?: boolean;

  /**
   * Tells pnpm to automatically install peer dependencies. It is true by default.
   */
  autoInstallPeers?: boolean;

  /**
   * By default, Bit saves component dependencies with exact versions (pinned) in the package.json,
   * even if the dependency-resolver policy specifies a version range.
   *
   * To preserve the range defined in the policy, set this value to "+".
   * To apply a predefined range ("~" or "^") to other component dependencies not covered by the policy,
   * set this to the desired range symbol.
   */
  componentRangePrefix?: ComponentRangePrefix;

  externalPackageManager?: boolean
}
