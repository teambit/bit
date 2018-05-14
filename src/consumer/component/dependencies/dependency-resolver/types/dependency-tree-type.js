// @flow

/**
 * Import Specifier data.
 * For example, `import foo from './bar' `, "foo" is the import-specifier and is default.
 * Conversely, `import { foo } from './bar' `, here, "foo" is non-default.
 */
export type Specifier = {
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

export type FileObject = {
  file: string,
  importSpecifiers?: ImportSpecifier[],
  importSource: string,
  isCustomResolveUsed?: boolean,
  isLink?: boolean,
  linkDependencies?: Object[]
};

export type LinkFile = {
  file: string,
  importSpecifiers: ImportSpecifier[]
};

export type FileDependencies = {
  files: FileObject[],
  packages?: Object,
  unidentifiedPackages?: string[],
  bits?: Object
};

export type Tree = {
  [main_file: string]: FileDependencies
};
