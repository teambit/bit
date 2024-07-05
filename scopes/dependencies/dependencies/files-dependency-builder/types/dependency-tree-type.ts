import R from 'ramda';
import { ResolvedPackageData } from '@teambit/legacy.utils';
import { DependencyDetector } from '../detector-hook';
import { ImportSpecifier } from '@teambit/legacy/dist/consumer/component/dependencies/dependency';

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

export type DependencyTreeParams = {
  componentDir: string;
  workspacePath: string;
  filePaths: string[];
  visited?: Record<string, any>;
  cacheResolvedDependencies?: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
  envDetectors?: DependencyDetector[] | null;
};
