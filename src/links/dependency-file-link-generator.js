// @flow
import path from 'path';
import { getWithoutExt, searchFilesIgnoreExt, getExt } from '../utils';
import { getSync } from '../api/consumer/lib/global-config';
import { DEFAULT_INDEX_NAME, CFG_REGISTRY_DOMAIN_PREFIX, DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../constants';
import type { PathOsBased, PathOsBasedAbsolute } from '../utils/path';
import { BitId } from '../bit-id';
import { Consumer } from '../consumer';
import logger from '../logger/logger';
import Component from '../consumer/component';
import type { RelativePath } from '../consumer/component/dependencies/dependency';
import ComponentMap from '../consumer/bit-map/component-map';
import { getLinkToFileContent, getLinkToPackageContent } from './link-content';

export type LinkFile = {
  linkPath: string,
  linkContent: string,
  isEs6: boolean,
  postInstallLink?: boolean, // postInstallLink is needed when custom module resolution was used
  symlinkTo?: ?PathOsBased // symlink (instead of link) is needed for unsupported files, such as binary files
};

type PrepareLinkFileParams = {
  linkPath: string,
  relativePathInDependency: PathOsBased,
  depRootDir: ?PathOsBasedAbsolute
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
  constructor({
    consumer,
    component,
    componentMap,
    relativePath,
    dependencyId,
    dependencyComponent,
    createNpmLinkFiles,
    targetDir
  }: {
    consumer: Consumer,
    component: Component,
    componentMap: ComponentMap,
    relativePath: RelativePath,
    dependencyId: BitId,
    dependencyComponent: Component,
    createNpmLinkFiles: boolean,
    targetDir?: string
  }) {
    this.consumer = consumer;
    this.component = component;
    this.componentMap = componentMap;
    this.relativePath = relativePath;
    this.dependencyId = dependencyId;
    this.dependencyComponent = dependencyComponent;
    this.createNpmLinkFiles = createNpmLinkFiles;
    this.targetDir = targetDir;
    this.isLinkToPackage = this.createNpmLinkFiles || !this.component.dependenciesSavedAsComponents;
  }

  generate(): LinkFile[] {
    const relativePathInDependency = path.normalize(this.relativePath.destinationRelativePath);
    const hasDist = this.component.dists.writeDistsFiles && !this.component.dists.isEmpty();
    const distRoot: PathOsBased = this.component.dists.getDistDirForConsumer(this.consumer, this.componentMap.rootDir);

    let relativeDistPathInDependency = searchFilesIgnoreExt(
      this.dependencyComponent.dists.get(),
      relativePathInDependency,
      'relative'
    );
    relativeDistPathInDependency = relativeDistPathInDependency // $FlowFixMe relative is defined
      ? relativeDistPathInDependency.relative
      : relativePathInDependency;

    const relativeDistExtInDependency = getExt(relativeDistPathInDependency);
    const sourceRelativePath = this.relativePath.sourceRelativePath;
    const linkPath = this.getLinkPath(relativeDistExtInDependency);

    const linkFiles = [];
    if (this.component.dependenciesSavedAsComponents) {
      this.consumer.bitMap.getComponent(this.dependencyId);
    }

    const depRootDir: ?PathOsBasedAbsolute = this.getDepRootDir();
    const depRootDirDist = this.getDepRootDirDist();

    const isCustomResolvedWithDistInside = Boolean(
      this.relativePath.isCustomResolveUsed &&
        depRootDirDist &&
        this.consumer.shouldDistsBeInsideTheComponent() &&
        hasDist
    );
    const isCustomResolvedWithDistAndNpmLink = Boolean(
      this.relativePath.isCustomResolveUsed &&
        this.consumer.shouldDistsBeInsideTheComponent() &&
        hasDist &&
        this.isLinkToPackage
    );

    const prepareLinkFileParams: PrepareLinkFileParams = {
      linkPath,
      relativePathInDependency:
        isCustomResolvedWithDistInside || isCustomResolvedWithDistAndNpmLink
          ? `${getWithoutExt(relativePathInDependency)}.${relativeDistExtInDependency}`
          : relativePathInDependency,
      depRootDir: isCustomResolvedWithDistInside ? depRootDirDist : depRootDir
    };

    const linkFile = this.prepareLinkFile(prepareLinkFileParams);
    if (this.relativePath.isCustomResolveUsed && this.createNpmLinkFiles) {
      linkFile.postInstallLink = true;
    }
    linkFiles.push(linkFile);

    if (hasDist) {
      prepareLinkFileParams.relativePathInDependency = relativeDistPathInDependency;
      prepareLinkFileParams.depRootDir = depRootDirDist;
      if (this.relativePath.isCustomResolveUsed) {
        if (!this.consumer.shouldDistsBeInsideTheComponent()) {
          // when isCustomResolvedUsed, the link is generated inside node_module directory, so for
          // dist inside the component, only one link is needed at the parentRootDir. for dist
          // outside the component dir, another link is needed for the dist/parentRootDir.
          // $FlowFixMe relativePath.importSource is set when isCustomResolveUsed
          prepareLinkFileParams.linkPath = path.join(distRoot, 'node_modules', this.relativePath.importSource);
          const linkFileInNodeModules = this.prepareLinkFile(prepareLinkFileParams);
          linkFiles.push(linkFileInNodeModules);
        }
      } else {
        const sourceRelativePathWithCompiledExt = `${getWithoutExt(sourceRelativePath)}.${relativeDistExtInDependency}`;
        // Generate a link file inside dist folder of the dependent component
        prepareLinkFileParams.linkPath = path.join(distRoot, sourceRelativePathWithCompiledExt);
        const linkFileInDist = this.prepareLinkFile(prepareLinkFileParams);
        linkFiles.push(linkFileInDist);
      }
    }

    return linkFiles;
  }

  getTargetDir(): PathOsBasedAbsolute {
    if (this.targetDir) return this.targetDir;
    // when running from bit build, the writtenPath is not available
    if (!this.component.writtenPath) return this.consumer.toAbsolutePath(this.componentMap.rootDir);
    if (path.isAbsolute(this.component.writtenPath)) return this.component.writtenPath;
    return this.consumer.toAbsolutePath(this.component.writtenPath);
  }

  getLinkPath(relativeDistExtInDependency: string): string {
    const sourceRelativePath = this.relativePath.sourceRelativePath;
    const parentDir = this.getTargetDir();
    if (!this.relativePath.isCustomResolveUsed) return path.join(parentDir, sourceRelativePath);
    // $FlowFixMe relativePath.importSource is set when isCustomResolveUsed
    const importSource: string = this.relativePath.importSource;
    const importSourceFileExt = relativeDistExtInDependency || path.extname(sourceRelativePath);
    // e.g. for require('utils/is-string'), the link should be at node_modules/utils/is-string/index.js
    const importSourceFile = path.extname(importSource)
      ? importSource
      : path.join(importSource, `${DEFAULT_INDEX_NAME}.${importSourceFileExt}`);
    const importSourcePath = path.join('node_modules', importSourceFile);
    // if createNpmLinkFiles, the path will be part of the postinstall script, so it shouldn't be absolute
    return this.createNpmLinkFiles ? importSourcePath : path.join(parentDir, importSourcePath);
  }

  prepareLinkFile({ linkPath, relativePathInDependency, depRootDir }: PrepareLinkFileParams): LinkFile {
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
    logger.debug(`prepareLinkFile, on ${linkPath}`);
    const linkPathExt = getExt(linkPath);
    const isEs6 = Boolean(importSpecifiers && linkPathExt === 'js');
    const symlinkTo = linkContent ? undefined : actualFilePath;
    return { linkPath, linkContent, isEs6, symlinkTo };
  }

  getLinkContent(relativeFilePath: PathOsBased): string {
    if (this.isLinkToPackage) {
      // this is used to convert the component name to a valid npm package  name
      const packagePath = `${getSync(CFG_REGISTRY_DOMAIN_PREFIX) ||
        DEFAULT_REGISTRY_DOMAIN_PREFIX}/${this.dependencyId.toStringWithoutVersion().replace(/\//g, '.')}`;
      return getLinkToPackageContent(relativeFilePath, packagePath);
    }
    return getLinkToFileContent(relativeFilePath, this.relativePath.importSpecifiers);
  }

  getRelativeDepRootDir(): ?PathOsBased {
    if (!this.dependencyComponentMap) return undefined;
    return this.dependencyComponentMap.rootDir || '.';
  }
  getDepRootDir(): ?PathOsBasedAbsolute {
    const consumerPath: PathOsBased = this.consumer.getPath();
    const rootDir = this.getRelativeDepRootDir();
    return rootDir ? path.join(consumerPath, rootDir) : undefined;
  }
  getDepRootDirDist(): ?PathOsBasedAbsolute {
    const rootDir = this.getRelativeDepRootDir();
    return rootDir ? this.dependencyComponent.dists.getDistDirForConsumer(this.consumer, rootDir) : undefined;
  }
}
