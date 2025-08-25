import type { ImportSpecifier } from '@teambit/legacy.consumer-component';
import type { ResolvedPackageData } from '../../resolve-pkg-data';
import type { DependencyDetector } from '@teambit/dependency-resolver';
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
  missing?: Record<MissingType, string[]>;

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
