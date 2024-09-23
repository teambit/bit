import { ImportSpecifier } from '@teambit/legacy/dist/consumer/component/dependencies/dependency';
import { ResolvedPackageData } from '../../resolve-pkg-data';
import { DependencyDetector } from '../detector-hook';
import { isEmpty } from 'lodash';

export type FileObject = {
  file: string;
  importSpecifiers?: ImportSpecifier[];
  importSource?: string;
};

type MissingType = 'files' | 'packages';

export class DependenciesTreeItem {
  files: FileObject[] = [];
  packages: { [packageName: string]: string } = {}; // pkgName: pkgVersion
  unidentifiedPackages: string[] = [];
  components: ResolvedPackageData[] = [];
  error?: Error; // error.code is either PARSING_ERROR or RESOLVE_ERROR
  missing?: { [key in MissingType]: string[] };
  devDeps: string[] = []; // components/packages that are used as types only. e.g. `import type x from 'y'`. components are saved by their pkgName.

  isEmpty() {
    return (
      !this.files.length &&
      isEmpty(this.packages) &&
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

export type DependencyTreeParams = {
  componentDir: string;
  workspacePath: string;
  filePaths: string[];
  visited?: Record<string, any>;
  cacheResolvedDependencies?: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
  envDetectors?: DependencyDetector[] | null;
};
