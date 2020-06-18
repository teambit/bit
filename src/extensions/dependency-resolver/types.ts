import { ComponentFS, ComponentConfig } from '../component';
import { PathLinux } from '../../utils/path';
/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type SemverVersion = string;
/**
 * Allowed values are valid semver values and the "-" sign.
 */
export type SemverVersionRule = SemverVersion | '-';
export type DetailedDependencyPolicy = {
  version: SemverVersion;
  /**
   * Force this dependency even if its not in use (useful for adding @types/x from example)
   */
  force?: boolean;
};

// TODO: add DetailedDependencyPolicy once support the force prop
// export type DependencyPolicy = SemverVersionRule | DetailedDependencyPolicy;
export type DependencyPolicy = SemverVersionRule;

export interface DependenciesPolicyObject {
  [dependencyId: string]: DependencyPolicy;
}

export interface DependenciesPolicy {
  dependencies?: DependenciesPolicyObject;
  devDependencies?: DependenciesPolicyObject;
  peerDependencies?: DependenciesPolicyObject;
}

export interface DependencyResolverWorkspaceConfig {
  policy: DependenciesPolicy;
  /**
   * choose the package manager for Bit to use. you can choose between 'npm', 'yarn', 'pnpm'
   * and 'librarian'. our recommendation is use 'librarian' which reduces package duplicates
   * and totally removes the need of a 'node_modules' directory in your project.
   */
  packageManager: 'npm' | 'yarn' | 'pnpm';
  /**
   * If true, then Bit will add the "--strict-peer-dependencies" option when invoking package managers.
   * This causes "bit install" to fail if there are unsatisfied peer dependencies, which is
   * an invalid state that can cause build failures or incompatible dependency versions.
   * (For historical reasons, JavaScript package managers generally do not treat this invalid
   * state as an error.)
   *
   * The default value is false to avoid legacy compatibility issues.
   * It is strongly recommended to set strictPeerDependencies=true.
   */
  strictPeerDependencies: boolean;
  /**
   * map of extra arguments to pass to the configured package manager upon the installation
   * of dependencies.
   */
  packageManagerArgs: string[];
}

export interface DependencyResolverVariantConfig {
  policy: DependenciesPolicy;
}

// Exact format TBD
export interface RawComponentState {
  filesystem: ComponentFS;
  config: ComponentConfig;
}

export type DependencyType = 'package' | 'component';

/**
 * Import Specifier data.
 * For example, `import foo from './bar' `, "foo" is the import-specifier and is default.
 * Conversely, `import { foo } from './bar' `, here, "foo" is non-default.
 */
export type Specifier = {
  isDefault: boolean;
  name: string;
};

/**
 * ImportSpecifier are used to generate links from component to its dependencies.
 * For example, a component might have a dependency: "import { foo } from './bar' ", when a link is generated, we use
 * the import-specifier name, which is "foo" to generate the link correctly.
 */
export type ImportSpecifier = {
  mainFile: Specifier;
  linkFile?: Specifier; // relevant only when the dependency is a link file (e.g. index.js which import and export the variable from other file)
};

/**
 * a dependency component may have multiple files that are required from the parent component, each
 * one of the files has its RelativePath instance.
 *
 * For example:
 * main component: "foo" => foo.js => `const isString = require('../utils/is-string'); const isArray = require('../utils/is-array');
 * dependency: "utils" => utils/is-string.js, utils/is-array.js
 * In this example, the component "foo" has one dependency "utils" with two RelativePaths.
 * one for utils/is-string.js file and the second for utils/is-array.js file
 */
export type RelativePath = {
  sourceRelativePath: PathLinux; // location of the link file
  destinationRelativePath: PathLinux; // destination written inside the link file
  importSpecifiers?: ImportSpecifier[];
  isCustomResolveUsed?: boolean; // custom resolve can be configured on consumer bit.json file in resolveModules attribute
  importSource?: string; // available when isCustomResolveUsed=true, contains the import path. e.g. "import x from 'src/utils'", importSource is 'src/utils'.
};

interface DependencyDefinition {
  dependencyId: string;
  dependencyVersion: SemverVersion;
  type: DependencyType;
  // Used for legacy support
  relativePaths?: RelativePath[];
}

/**
 * A definition of one dependency statement in a file
 * For example `import('something')` or require('something')
 */
interface FileDependencyDefinition {
  // The path itself as appear in the source code (what inside the () for example)
  // This can be a module path like 'my-package' or relative (for legacy support)
  dependencyPath: string;
  // Used for legacy support
  relativePaths?: RelativePath[];
  // Used for statements like `import type {x} from 'y'
  isType?: boolean;
}

export type FileDependenciesDefinition = FileDependencyDefinition[];

export interface DependenciesDefinition {
  dependencies?: DependencyDefinition[];
  devDependencies?: DependencyDefinition[];
  peerDependencies?: DependencyDefinition[];
}

export type installOpts = {
  packageManager?: string;
};
