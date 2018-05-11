/** @flow */
import { BitId } from '../../../bit-id';
import type { PathLinux } from '../../../utils/path';

/**
 * Import Specifier data.
 * For example, `import foo from './bar' `, "foo" is the import-specifier and is default.
 * Conversely, `import { foo } from './bar' `, here, "foo" is non-default.
 */
type Specifier = {
  isDefault: boolean,
  name: string
};

/**
 * ImportSpecifier are used to generate links from component to its dependencies.
 * For example, a component might have a dependency: "import { foo } from './bar' ", when a link is generated, we use
 * the import-specifier name, which is "foo" to generate the link correctly.
 */
export type ImportSpecifier = {
  mainFile: Specifier,
  linkFile?: Specifier // relevant only when the dependency is a link file (e.g. index.js which import and export the variable from other file)
};

export type RelativePath = {
  sourceRelativePath: PathLinux,
  destinationRelativePath: PathLinux,
  importSpecifiers?: ImportSpecifier[],
  importSource: string, // needed when isCustomResolveUsed=true
  isCustomResolveUsed?: boolean // custom resolve can be configured on consumer bit.json file in resolveModules attribute
};

export default class Dependency {
  id: BitId;
  relativePaths: RelativePath[];
  constructor(id: BitId, relativePaths: RelativePath[]) {
    this.id = id;
    this.relativePaths = relativePaths;
  }
}
