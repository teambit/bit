import R from 'ramda';
import { ResolvedPackageData } from '../../../../../utils/packages';

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
  linkFile?: Specifier; // relevant only when the dependency is a link file (e.g. index.js which import and export the variable from other file)
};

export type FileObject = {
  file: string;
  importSpecifiers?: ImportSpecifier[];
  importSource?: string;
  isCustomResolveUsed?: boolean;
  isLink?: boolean;
  linkDependencies?: Record<string, any>[];
};

export type LinkFile = {
  file: string;
  importSpecifiers: ImportSpecifier[];
};

type MissingType = 'files' | 'packages' | 'components';

export class DependenciesTreeItem {
  files: FileObject[] = [];
  packages: { [packageName: string]: string } = {}; // pkgName: pkgVersion
  unidentifiedPackages: string[] = [];
  components: ResolvedPackageData[] = [];
  error?: Error; // error.code is either PARSING_ERROR or RESOLVE_ERROR
  missing?: { [key in MissingType]: string[] };

  isEmpty() {
    return (
      !this.files.length &&
      R.isEmpty(this.packages) &&
      !this.unidentifiedPackages.length &&
      !this.components.length &&
      !this.error &&
      !this.missing
    );
  }
}

export type DependenciesTree = {
  [filePath: string]: DependenciesTreeItem;
};

export type ResolveModulesConfig = {
  modulesDirectories?: string[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  aliases?: { [key: string]: string }; // e.g. { '@': 'src' }
};

export type DependencyTreeParams = {
  componentDir: string;
  workspacePath: string;
  filePaths: string[];
  bindingPrefix: string;
  isLegacyProject: boolean;
  resolveModulesConfig?: ResolveModulesConfig;
  visited?: Record<string, any>;
  cacheResolvedDependencies?: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
};
