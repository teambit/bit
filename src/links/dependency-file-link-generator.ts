import * as path from 'path';

import { BitId } from '../bit-id';
import { DEFAULT_DIST_DIRNAME, DEFAULT_INDEX_NAME } from '../constants';
import BitMap from '../consumer/bit-map';
import ComponentMap from '../consumer/bit-map/component-map';
import { throwForNonLegacy } from '../consumer/component/component-schema';
import Component from '../consumer/component/consumer-component';
import { RelativePath } from '../consumer/component/dependencies/dependency';
import Consumer from '../consumer/consumer';
import logger from '../logger/logger';
import { getExt, getWithoutExt, searchFilesIgnoreExt } from '../utils';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { pathNormalizeToLinux, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative } from '../utils/path';
import {
  EXTENSIONS_NOT_SUPPORT_DIRS,
  EXTENSIONS_TO_REPLACE_TO_JS_IN_PACKAGES,
  EXTENSIONS_TO_STRIP_FROM_PACKAGES,
  getLinkToPackageContent,
} from './link-content';

export type LinkFileType = {
  linkPath: string;
  linkContent: string;
  isEs6?: boolean;
  postInstallLink?: boolean; // postInstallLink is needed when custom module resolution was used
  postInstallSymlink?: boolean; // postInstallSymlink is needed when custom module resolution was used with unsupported file extension
  symlinkTo?: PathOsBased | null | undefined; // symlink (instead of link) is needed for unsupported files, such as binary files
  customResolveMapping?: { [key: string]: string } | null | undefined; // needed when custom module resolution was used
};

/**
 * a dependency component may have multiple files required by the main component.
 * this class generates the link content of one file of a dependency.
 * @see RelativePath docs for more info
 */
export default class DependencyFileLinkGenerator {
  consumer: Consumer | null | undefined;
  bitMap: BitMap;
  component: Component;
  componentMap: ComponentMap;
  relativePath: RelativePath;
  dependencyId: BitId;
  dependencyComponent: Component;
  createNpmLinkFiles: boolean;
  targetDir: string | null | undefined;
  dependencyComponentMap: ComponentMap | null | undefined;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  linkFiles: LinkFileType[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  relativePathInDependency: PathOsBased;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  hasDist: boolean;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  shouldDistsBeInsideTheComponent: boolean;
  constructor({
    consumer,
    bitMap,
    component,
    relativePath,
    dependencyComponent,
    createNpmLinkFiles,
    targetDir,
  }: {
    consumer: Consumer | null | undefined;
    bitMap: BitMap;
    component: Component;
    relativePath: RelativePath;
    dependencyComponent: Component;
    createNpmLinkFiles: boolean;
    targetDir?: string;
  }) {
    throwForNonLegacy(component.isLegacy, DependencyFileLinkGenerator.name);
    this.consumer = consumer;
    this.bitMap = bitMap;
    this.component = component; // $FlowFixMe componentMap should be set here
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentMap = this.component.componentMap;
    this.relativePath = relativePath;
    this.dependencyComponent = dependencyComponent;
    this.dependencyId = dependencyComponent.id;
    this.createNpmLinkFiles = createNpmLinkFiles;
    this.targetDir = targetDir;
  }

  generate(): LinkFileType[] {
    this.linkFiles = [];
    if (this.component.dependenciesSavedAsComponents) {
      this.dependencyComponent.componentMap = this.bitMap.getComponent(this.dependencyId);
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
      depRootDir: this._getDepRootDir(),
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
    const dependencyDistExt = getExt(relativeDistPathInDependency);
    const relativeDistExtInDependency = EXTENSIONS_TO_REPLACE_TO_JS_IN_PACKAGES.includes(dependencyDistExt)
      ? 'js'
      : dependencyDistExt;
    const depRootDir = this._getDepRootDir();
    const depRootDirDist = this._getDepRootDirDist();

    const isCustomResolvedWithDistInside = Boolean(this.shouldDistsBeInsideTheComponent && this.hasDist);

    const relativePathInDependency = `${getWithoutExt(this.relativePathInDependency)}.${relativeDistExtInDependency}`;

    const linkFile = this.prepareLinkFile({
      linkPath: this.getLinkPathForCustomResolve(relativeDistExtInDependency),
      relativePathInDependency,
      depRootDir: isCustomResolvedWithDistInside ? depRootDirDist : depRootDir,
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
        depRootDir: depRootDirDist,
      });
      this.linkFiles.push(linkFileInNodeModules);
    }

    if (getExt(this.relativePathInDependency) === 'ts') {
      // this is needed for when building Angular components inside a capsule, so we don't care
      // about the case when dist is outside the components
      const linkFileTs = this.prepareLinkFile({
        linkPath: this.getLinkPathForCustomResolve(relativeDistExtInDependency).replace('.js', '.d.ts'),
        relativePathInDependency: relativePathInDependency.replace('.js', '.ts'),
        depRootDir: isCustomResolvedWithDistInside ? depRootDirDist : depRootDir,
      });
      if (this.createNpmLinkFiles && linkFile.linkContent) {
        linkFileTs.postInstallLink = true;
      }
      this.linkFiles.push(linkFileTs);
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
      depRootDir: this._getDepRootDirDist(),
    });
    this.linkFiles.push(linkFileInDist);
  }

  prepareLinkFile({
    linkPath,
    relativePathInDependency,
    depRootDir,
  }: {
    linkPath: PathOsBased;
    relativePathInDependency: PathOsBased;
    depRootDir: PathOsBasedAbsolute | null | undefined;
  }): LinkFileType {
    const actualFilePath = depRootDir ? path.join(depRootDir, relativePathInDependency) : relativePathInDependency;
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
    if (this.createNpmLinkFiles) {
      return this._getPackagePathToInternalFile();
    }
    if (!this.component.dependenciesSavedAsComponents) {
      return path.join(this.getTargetDir(), 'node_modules', this._getPackagePathToInternalFile());
    }
    // if dependencies are saved as components, the above logic will create a symlink to a symlink
    return filePath;
  }

  getLinkContent(relativeFilePath: PathOsBased): string {
    return getLinkToPackageContent(relativeFilePath, this._getPackagePath(), this.relativePath.importSpecifiers);
  }

  _getPackagePath(): string {
    const ext = getExt(this.relativePath.destinationRelativePath);
    if (
      this.relativePath.destinationRelativePath === pathNormalizeToLinux(this.dependencyComponent.mainFile) &&
      !EXTENSIONS_NOT_SUPPORT_DIRS.includes(ext)
    ) {
      return this._getPackageName();
    }
    const distFileIsNotFound =
      !this.dependencyComponent.dists.isEmpty() &&
      !this.dependencyComponent.dists.hasFileParallelToSrcFile(this.relativePath.destinationRelativePath);
    if (distFileIsNotFound) {
      return this._getPackagePathByDistWithComponentPrefix();
    }
    // the link is to an internal file, not to the main file
    return this._getPackagePathToInternalFile();
  }

  /**
   * temporary workaround for Angular compiler when all dists have the prefix of the component id
   */
  _getPackagePathByDistWithComponentPrefix() {
    const distFileWithDependencyPrefix = path.join(
      this.dependencyId.toStringWithoutVersion(),
      this.relativePath.destinationRelativePath
    );
    if (
      !this.dependencyComponent.dists.isEmpty() &&
      this.dependencyComponent.dists.hasFileParallelToSrcFile(distFileWithDependencyPrefix)
    ) {
      const distFile = searchFilesIgnoreExt(
        this.dependencyComponent.dists.get(),
        distFileWithDependencyPrefix,
        'relative'
      );
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return this._getPackagePathToInternalFile(distFile);
    }
    return this._getPackageName();
  }

  _getPackageName() {
    return componentIdToPackageName(this.dependencyComponent);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _getPackagePathToInternalFile(filePath?: string = this.relativePath.destinationRelativePath) {
    const packageName = this._getPackageName();
    const internalFileInsidePackage = this._getInternalFileInsidePackage(filePath);
    const ext = getExt(internalFileInsidePackage);
    const internalFileWithoutExt = EXTENSIONS_TO_STRIP_FROM_PACKAGES.includes(ext)
      ? getWithoutExt(internalFileInsidePackage)
      : internalFileInsidePackage;
    return `${packageName}/${internalFileWithoutExt}`;
  }

  _getInternalFileInsidePackage(filePath: string) {
    const dependencySavedLocallyAndDistIsOutside = this.dependencyComponentMap && !this.shouldDistsBeInsideTheComponent;
    const distPrefix =
      this.dependencyComponent.dists.isEmpty() ||
      this.relativePath.isCustomResolveUsed ||
      dependencySavedLocallyAndDistIsOutside
        ? ''
        : `${DEFAULT_DIST_DIRNAME}/`;
    return distPrefix + filePath;
  }

  _getCustomResolveMapping() {
    if (!this.relativePath.isCustomResolveUsed) return null;
    // $FlowFixMe importSource is set for custom resolved
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const importSource: string = this.relativePath.importSource;
    const importSourceFileExt = relativeDistExtInDependency || path.extname(this.relativePath.sourceRelativePath);
    // e.g. for require('utils/is-string'), the link should be at node_modules/utils/is-string/index.js
    const importSourceFile = path.extname(importSource)
      ? importSource
      : path.join(importSource, `${DEFAULT_INDEX_NAME}.${importSourceFileExt}`);
    return path.join('node_modules', importSourceFile);
  }

  _getDepRootDir(): PathOsBasedRelative | null | undefined {
    if (!this.dependencyComponentMap) return undefined;
    return this.dependencyComponentMap.getRootDir();
  }

  _getDepRootDirDist(): PathOsBasedRelative | null | undefined {
    const rootDir = this._getDepRootDir();
    return rootDir ? this.dependencyComponent.dists.getDistDir(this.consumer, rootDir) : undefined;
  }
}
