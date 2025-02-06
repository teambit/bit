import { cloneDeep } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { PathLinux } from '@teambit/toolbox.path.path';

/**
 * Import Specifier data.
 * For example, `import foo from './bar' `, "foo" is the import-specifier and is default.
 * Conversely, `import { foo } from './bar' `, here, "foo" is non-default.
 */
export type Specifier = {
  isDefault: boolean;
  name: string;
  exported?: boolean;
};

/**
 * ImportSpecifier are used to generate links from component to its dependencies.
 * For example, a component might have a dependency: "import { foo } from './bar' ", when a link is generated, we use
 * the import-specifier name, which is "foo" to generate the link correctly.
 */
export type ImportSpecifier = {
  mainFile: Specifier;
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
  importSource?: string; // available when isCustomResolveUsed=true, contains the import path. e.g. "import x from 'src/utils'", importSource is 'src/utils'.
};

export default class Dependency {
  id: ComponentID;
  relativePaths: RelativePath[];
  packageName?: string;
  versionRange?: string;

  constructor(id: ComponentID, relativePaths: RelativePath[], packageName?: string, versionRange?: string) {
    this.id = id;
    this.relativePaths = relativePaths;
    this.packageName = packageName;
    this.versionRange = versionRange;
  }

  serialize() {
    return {
      id: this.id.toObject(),
      relativePaths: this.relativePaths,
      packageName: this.packageName,
      versionRange: this.versionRange,
    };
  }

  static deserialize(serialized: Record<string, any>) {
    const id = ComponentID.fromObject(serialized.id);
    const relativePaths = serialized.relativePaths;
    const packageName = serialized.packageName;
    const versionRange = serialized.versionRange;
    return new Dependency(id, relativePaths, packageName, versionRange);
  }

  static getClone(dependency: Dependency): Record<string, any> {
    return {
      id: dependency.id,
      relativePaths: cloneDeep(dependency.relativePaths),
      packageName: dependency.packageName,
      versionRange: dependency.versionRange,
    };
  }
}
