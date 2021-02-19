import { ComponentConfig, ComponentFS } from '@teambit/component';
import { PathLinux } from '@teambit/legacy/dist/utils/path';

import { ComponentManifest } from './manifest/component-manifest';
import { PackageName } from './dependencies';

export type RegistryName = string;

export type Registry = {
  uri: string;
  alwaysAuth: boolean;
  authHeaderValue?: string;
  originalAuthType: string;
  originalAuthValue: string;
};

export type RegistriesMap = Record<RegistryName, Registry>;

// Exact format TBD
export interface RawComponentState {
  filesystem: ComponentFS;
  config: ComponentConfig;
}

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

export type ComponentsManifestsMap = Map<PackageName, ComponentManifest>;
