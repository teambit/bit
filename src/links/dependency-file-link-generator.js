// @flow
import path from 'path';
import { getWithoutExt, searchFilesIgnoreExt, getExt } from '../utils';
import { DEFAULT_INDEX_NAME, DEFAULT_DIST_DIRNAME } from '../constants';
import type { PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative } from '../utils/path';
import { BitId } from '../bit-id';
import type Consumer from '../consumer/consumer';
import logger from '../logger/logger';
import type Component from '../consumer/component/consumer-component';
import type { RelativePath } from '../consumer/component/dependencies/dependency';
import type ComponentMap from '../consumer/bit-map/component-map';
import { getLinkToFileContent, getLinkToPackageContent } from './link-content';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { pathNormalizeToLinux } from '../utils/path';

export type LinkFileType = {
  linkPath: string,
  linkContent: string,
  isEs6?: boolean,
  postInstallLink?: boolean, // postInstallLink is needed when custom module resolution was used
  postInstallSymlink?: boolean, // postInstallSymlink is needed when custom module resolution was used with unsupported file extension
  symlinkTo?: ?PathOsBased, // symlink (instead of link) is needed for unsupported files, such as binary files
  customResolveMapping?: ?{ [string]: string } // needed when custom module resolution was used
};

/**
 * a dependency component may have multiple files required by the main component.
 * this class generates the link content of one file of a dependency.
 * @see RelativePath docs for more info
 */
export default class DependencyFileLinkGenerator {
  consumer: Consumer;
  component: Component;
  componentMap: ComponentMap;
  relativePath: RelativePath;
  dependencyId: BitId;
  dependencyComponent: Component;
  createNpmLinkFiles: boolean;
  targetDir: ?string;
  isLinkToPackage: boolean;
  dependencyComponentMap: ?ComponentMap;
  linkFiles: LinkFileType[];
  relativePathInDependency: PathOsBased;
  hasDist: boolean;
  shouldDistsBeInsideTheComponent: boolean;
  constructor({
    consumer,
    component,
    relativePath,
    dependencyComponent,
    createNpmLinkFiles,
    targetDir
  }: {
    consumer: Consumer,
    component: Component,
    relativePath: RelativePath,
    dependencyComponent: Component,
    createNpmLinkFiles: boolean,
    targetDir?: string
  }) {
    this.consumer = consumer;
    this.component = component; // $FlowFixMe componentMap should be set here
    this.componentMap = this.component.componentMap;
    this.relativePath = relativePath;
    this.dependencyComponent = dependencyComponent;
    this.dependencyId = dependencyComponent.id;
    this.createNpmLinkFiles = createNpmLinkFiles;
    this.targetDir = targetDir;
    this.isLinkToPackage = this.createNpmLinkFiles || !this.component.dependenciesSavedAsComponents;
  }

  generate(): LinkFileType[] {
    this.linkFiles = [];
    if (this.component.dependenciesSavedAsComponents) {
      this.dependencyComponent.componentMap = this.consumer.bitMap.getComponent(this.dependencyId);
      this.dependencyComponentMap = this.dependencyComponent.componentMap;
    }
    this.relativePathInDependency = path.normalize(this.relativePath.destinationRelativePath);
    this.hasDist = this.component.dists.writeDistsFiles && !this.component.dists.isEmpty();
    this.shouldDistsBeInsideTheComponent = this.consumer ? this.consumer.shouldDistsBeInsideTheComponent() : true;
    if (this.relativePath.isCustomResolveUsed) {
      return this.generateForCustomResolve();
    }
    const linkFile = this.prepareLinkFile({
      linkPath: this.getLinkPath(),
      relativePathInDependency: this.relativePathInDependency,
      depRootDir: this._getDepRootDir()
    });
    this.linkFiles.push(linkFile);

    if (this.hasDist) {
      this.generateForDist();
    }

    return this.linkFiles;
  }

  generateForCustomResolve(): LinkFileType[] {
    const distRoot = this._getDistRoot();
    const relativeDistPathInDependency = this._getRelativeDistPathInDependency();
    const relativeDistExtInDependency = getExt(relativeDistPathInDependency);
    const depRootDir = this._getDepRootDir();
    const depRootDirDist = this._getDepRootDirDist();

    const isCustomResolvedWithDistInside = Boolean(
      depRootDirDist && this.shouldDistsBeInsideTheComponent && this.hasDist
    );
    const isCustomResolvedWithDistAndNpmLink = Boolean(
      this.shouldDistsBeInsideTheComponent && this.hasDist && this.isLinkToPackage
    );

    const relativePathInDependency =
      isCustomResolvedWithDistInside || isCustomResolvedWithDistAndNpmLink
        ? `${getWithoutExt(this.relativePathInDependency)}.${relativeDistExtInDependency}`
        : this.relativePathInDependency;

    const linkFile = this.prepareLinkFile({
      linkPath: this.getLinkPathForCustomResolve(relativeDistExtInDependency),
      relativePathInDependency,
      depRootDir: isCustomResolvedWithDistInside ? depRootDirDist : depRootDir
    });
    if (this.createNpmLinkFiles && linkFile.linkContent) {
      linkFile.postInstallLink = true;
    }
    this.linkFiles.push(linkFile);

    if (this.hasDist && !this.shouldDistsBeInsideTheComponent) {
      // when isCustomResolvedUsed, the link is generated inside node_module directory, so for
      // dist inside the component, only one link is needed at the parentRootDir. for dist
      // outside the component dir, another link is needed for the dist/parentRootDir.
      const importSourcePath = this._getImportSourcePathForCustomResolve(relativeDistExtInDependency);
      const linkFileInNodeModules = this.prepareLinkFile({
        linkPath: path.join(distRoot, importSourcePath),
        relativePathInDependency: relativeDistPathInDependency,
        depRootDir: depRootDirDist
      });
      this.linkFiles.push(linkFileInNodeModules);
    }

    return this.linkFiles;
  }

  generateForDist() {
    const distRoot = this._getDistRoot();
    const relativeDistPathInDependency = this._getRelativeDistPathInDependency();
    const relativeDistExtInDependency = getExt(relativeDistPathInDependency);
    const sourceRelativePathWithCompiledExt = `${getWithoutExt(
      this.relativePath.sourceRelativePath
    )}.${relativeDistExtInDependency}`;
    const linkFileInDist = this.prepareLinkFile({
      linkPath: path.join(distRoot, sourceRelativePathWithCompiledExt), // Generate a link file inside dist folder of the dependent component
      relativePathInDependency: relativeDistPathInDependency,
      depRootDir: this._getDepRootDirDist()
    });
    this.linkFiles.push(linkFileInDist);
  }

  prepareLinkFile({
    linkPath,
    relativePathInDependency,
    depRootDir
  }: {
    linkPath: PathOsBased,
    relativePathInDependency: PathOsBased,
    depRootDir: ?PathOsBasedAbsolute
  }): LinkFileType {
    const mainFile: PathOsBased = this.dependencyComponent.dists.calculateMainDistFile(
      this.dependencyComponent.mainFile
    );
    let actualFilePath = depRootDir ? path.join(depRootDir, relativePathInDependency) : relativePathInDependency;
    if (relativePathInDependency === mainFile) {
      actualFilePath = depRootDir ? path.join(depRootDir, mainFile) : mainFile;
    }
    const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);
    const importSpecifiers = this.relativePath.importSpecifiers;
    const linkContent = this.getLinkContent(relativeFilePath);
    const customResolveMapping = this._getCustomResolveMapping();
    logger.debug(`prepareLinkFile, on ${linkPath}`);
    const linkPathExt = getExt(linkPath);
    const isEs6 = Boolean(importSpecifiers && linkPathExt === 'js');

    const symlinkTo = linkContent ? undefined : this._getSymlinkDest(actualFilePath);
    const postInstallSymlink = this.createNpmLinkFiles && !linkContent;

    return { linkPath, linkContent, isEs6, symlinkTo, customResolveMapping, postInstallSymlink };
  }

  _getSymlinkDest(filePath: PathOsBased): string {
    if (this.isLinkToPackage) {
      if (this.createNpmLinkFiles) {
        return this._getPackagePathToInternalFile();
      }
      return path.join(this.getTargetDir(), 'node_modules', this._getPackagePathToInternalFile());
    }
    return filePath;
  }

  getLinkContent(relativeFilePath: PathOsBased): string {
    if (this.isLinkToPackage) {
      return getLinkToPackageContent(relativeFilePath, this._getPackagePath());
    }
    return getLinkToFileContent(relativeFilePath, this.relativePath.importSpecifiers);
  }

  _getPackagePath(): string {
    if (this.relativePath.destinationRelativePath === pathNormalizeToLinux(this.dependencyComponent.mainFile)) {
      return this._getPackageName();
    }
    // the link is to an internal file, not to the main file
    return this._getPackagePathToInternalFile();
  }

  _getPackageName() {
    return componentIdToPackageName(this.dependencyId, this.dependencyComponent.bindingPrefix);
  }

  _getPackagePathToInternalFile() {
    const packageName = this._getPackageName();
    const distPrefix =
      this.dependencyComponent.dists.isEmpty() || this.relativePath.isCustomResolveUsed
        ? ''
        : `${DEFAULT_DIST_DIRNAME}/`;
    return `${packageName}/${distPrefix}${this.relativePath.destinationRelativePath}`;
  }

  _getCustomResolveMapping() {
    if (!this.relativePath.isCustomResolveUsed) return null;
    // $FlowFixMe importSource is set for custom resolved
    return { [this.relativePath.importSource]: this._getPackagePath() };
  }

  getTargetDir(): PathOsBasedRelative {
    const determineTargetDir = () => {
      if (this.targetDir) return this.targetDir;
      const writtenPath = this.component.writtenPath;
      // $FlowFixMe when running from bit build, the writtenPath is not available but it should have rootDir as it's related to the dists links
      if (!writtenPath) return this.componentMap.rootDir;
      if (path.isAbsolute(writtenPath)) {
        throw new Error('getTargetDir: component.writtenPath should be relative');
      }
      return writtenPath;
    };
    const targetDir = determineTargetDir();
    if (!targetDir || !(typeof targetDir === 'string')) {
      throw new Error('targetDir must be of type string');
    }
    return targetDir;
  }

  getLinkPath(): PathOsBased {
    const sourceRelativePath = this.relativePath.sourceRelativePath;
    const parentDir = this.getTargetDir();
    return path.join(parentDir, sourceRelativePath);
  }

  getLinkPathForCustomResolve(relativeDistExtInDependency: string): PathOsBased {
    const parentDir = this.getTargetDir();
    const importSourcePath = this._getImportSourcePathForCustomResolve(relativeDistExtInDependency);
    // if createNpmLinkFiles, the path will be part of the postinstall script, so it shouldn't be absolute
    return this.createNpmLinkFiles ? importSourcePath : path.join(parentDir, importSourcePath);
  }

  _getDistRoot(): PathOsBasedRelative {
    return this.component.dists.getDistDir(this.consumer, this.componentMap.getRootDir());
  }

  _getRelativeDistPathInDependency() {
    const relativeDistPathInDependency = searchFilesIgnoreExt(
      this.dependencyComponent.dists.get(),
      this.relativePathInDependency
    );
    return relativeDistPathInDependency // $FlowFixMe relative is defined
      ? relativeDistPathInDependency.relative
      : this.relativePathInDependency;
  }

  _getImportSourcePathForCustomResolve(relativeDistExtInDependency: string): PathOsBased {
    // $FlowFixMe relativePath.importSource is set when isCustomResolveUsed
    const importSource: string = this.relativePath.importSource;
    const importSourceFileExt = relativeDistExtInDependency || path.extname(this.relativePath.sourceRelativePath);
    // e.g. for require('utils/is-string'), the link should be at node_modules/utils/is-string/index.js
    const importSourceFile = path.extname(importSource)
      ? importSource
      : path.join(importSource, `${DEFAULT_INDEX_NAME}.${importSourceFileExt}`);
    return path.join('node_modules', importSourceFile);
  }

  _getDepRootDir(): ?PathOsBasedRelative {
    if (!this.dependencyComponentMap) return undefined;
    return this.dependencyComponentMap.getRootDir();
  }

  _getDepRootDirDist(): ?PathOsBasedRelative {
    const rootDir = this._getDepRootDir();
    return rootDir ? this.dependencyComponent.dists.getDistDir(this.consumer, rootDir) : undefined;
  }
}
