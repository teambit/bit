import * as path from 'path';

import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS, DEFAULT_DIST_DIRNAME, NODE_PATH_SEPARATOR } from '../../../constants';
import { getLinksInDistToWrite } from '../../../links';
import logger from '../../../logger/logger';
import { ComponentWithDependencies } from '../../../scope';
import Source from '../../../scope/models/source';
import { DistFileModel } from '../../../scope/models/version';
import { pathRelativeLinux, searchFilesIgnoreExt } from '../../../utils';
import { PathLinux, pathNormalizeToLinux, PathOsBased, PathOsBasedRelative } from '../../../utils/path';
import BitMap from '../../bit-map';
import ComponentMap from '../../bit-map/component-map';
import { stripSharedDirFromPath } from '../../component-ops/manipulate-dir';
import { ILegacyWorkspaceConfig } from '../../config';
import Consumer from '../../consumer';
import Component from '../consumer-component';
import DataToPersist from './data-to-persist';
import Dist from './dist';

/**
 * Dist paths are by default saved into the component's root-dir/dist. However, when dist is set in bit.json, the paths
 * are in the consumer-root/dist.target dir. If dist.entry is set, the dist.entry part is stripped from the dists paths.
 * (according to some additional conditions. See shouldDistEntryBeStripped()).
 * If there is originallySharedDir and the component is IMPORTED, it is stripped as well.
 *
 * These modifications of the paths are taken care in different stages depends on the scenario.
 * 1) using 'bit build'.
 * First, the sharedOriginallyDir is stripped (happens in consumer-component.build()). There are two scenarios here:
 *   a) the component wasn't change since the last build. It loads the dists from the model and strip the
 *      sharedOriginallyDir. (see the !needToRebuild case of build()).
 *   b) the component was changed. It re-builds it. The dists path are cloned from the files, since the files are
 *      sharedOriginallyDir stripped (because they loaded from the filesystem), so will be the dists files.
 * Next, the dist.entry is stripped. This is done when the dists are written into the file-system,  (see writeDists()).
 *
 * 2) using 'bit import'.
 * When converting the component from model to consumer-component, the sharedOriginallyDir is stripped. (see
 * stripOriginallySharedDir() ).
 * Then, Before writing the dists to the file-system, the dist-entry is taken care of. (see writeDists() ).
 *
 * 3) using 'bit link'.
 * When linking authored components, we generate an index file from node_modules/component-name to the main dist file.
 * It might happen during the import, when updateDistsPerWorkspaceConfig() was running already, and it might happen
 * during the 'bit link' command. Therefore, before linking, the updateDistsPerWorkspaceConfig() is running while making
 * sure it doesn't run twice.
 * (see node-modules-linker.linkToMainFile() and calculateMainDistFileForAuthored()).
 *
 * The opposite action is taken when a component is tagged. We load the component from the file-system while the dist
 * paths might be stripped from consumer dist.entry and originallySharedDir.
 * Then, before writing them to the model, we first add the originallySharedDir and then the dist.entry. We make sure
 * there were stripped before adding them. (See this.toDistFilesModel() function and the comment there)
 */
export default class Dists {
  dists: Dist[];
  writeDistsFiles = true; // changed only when importing a component
  areDistsInsideComponentDir: boolean | null | undefined = true;
  distEntryShouldBeStripped: boolean | null | undefined = false;
  _mainDistFile: PathOsBasedRelative | null | undefined;
  distsRootDir: PathOsBasedRelative | null | undefined; // populated only after getDistDirForConsumer() is called
  constructor(dists: Dist[] | null | undefined, mainDistFile: PathOsBased | null | undefined) {
    this._mainDistFile = mainDistFile;
    this.dists = dists || []; // cover also case of null (when it comes from the model)
  }

  isEmpty() {
    return !this.dists.length;
  }

  get() {
    return this.dists;
  }

  getAsReadable(): string[] {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.dists.map((file) => file.toReadableString());
  }
  getMainDistFile() {
    return this._mainDistFile;
  }

  /**
   * When dists are written by a consumer (as opposed to isolated-environment for example), the dist-entry and
   * dist-target are taken into account for calculating the path.
   * By default, the dists path is inside the component. If dist attribute is populated in bit.json, the path is
   * relative to consumer root.
   */
  getDistDirForConsumer(consumer: Consumer, componentRootDir: PathLinux): PathOsBasedRelative {
    if (consumer.shouldDistsBeInsideTheComponent()) {
      this.distsRootDir = path.join(componentRootDir, DEFAULT_DIST_DIRNAME);
    } else {
      this.areDistsInsideComponentDir = false;
      this.distsRootDir = Dists.getDistDirWhenDistIsOutsideCompDir(consumer.config, componentRootDir);
    }
    return this.distsRootDir;
  }

  hasFileParallelToSrcFile(srcFile: PathLinux): boolean {
    const distFile = searchFilesIgnoreExt(this.dists, path.normalize(srcFile));
    return Boolean(distFile);
  }

  static getDistDirWhenDistIsOutsideCompDir(
    workspaceConfig: ILegacyWorkspaceConfig,
    componentRootDir: PathLinux
  ): PathOsBasedRelative {
    if (workspaceConfig._distEntry) componentRootDir = componentRootDir.replace(workspaceConfig._distEntry, '');
    const distTarget = workspaceConfig._distTarget || DEFAULT_DIST_DIRNAME;
    return path.join(distTarget, componentRootDir);
  }

  getDistDir(consumer: Consumer | null | undefined, componentRootDir: PathLinux): PathOsBasedRelative {
    if (consumer) return this.getDistDirForConsumer(consumer, componentRootDir);
    this.distsRootDir = path.join(componentRootDir, DEFAULT_DIST_DIRNAME);
    return this.distsRootDir;
  }

  updateDistsPerWorkspaceConfig(id: BitId, consumer: Consumer | null | undefined, componentMap: ComponentMap): void {
    if (this.isEmpty()) return;
    const newDistBase = this.getDistDir(consumer, componentMap.getRootDir());
    this.dists.forEach((dist) => dist.updatePaths({ newBase: newDistBase }));
    if (consumer) this.stripDistEntryIfNeeded(id, consumer, componentMap);
  }

  stripDistEntryIfNeeded(id: BitId, consumer: Consumer, componentMap: ComponentMap) {
    const distEntry = consumer.config._distEntry;
    if (!distEntry) return;
    const shouldDistEntryBeStripped = (): boolean => {
      if (this.distEntryShouldBeStripped) return false; // it has been already stripped, don't strip twice!
      if (!distEntry || componentMap.origin === COMPONENT_ORIGINS.NESTED) return false;
      const areAllDistsStartWithDistEntry = () => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.dists.map((dist) => dist.relative.startsWith(distEntry)).every((x) => x);
      };
      if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
        return areAllDistsStartWithDistEntry();
      }
      // it's IMPORTED. We first check that rootDir starts with dist.entry, it happens mostly when a user imports into
      // a specific directory (e.g. bit import --path src/). Then, we make sure all dists files start with that
      // dist.entry. In a case when originallySharedDir is the same as dist.entry, this second check returns false.
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return componentMap.rootDir.startsWith(distEntry) && areAllDistsStartWithDistEntry();
    };
    const distEntryShouldBeStripped = shouldDistEntryBeStripped();
    if (!distEntryShouldBeStripped) return;
    logger.debug(`stripping dist.entry "${distEntry}" from ${id.toString()}`);
    this.distEntryShouldBeStripped = true;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.dists.forEach((dist) => dist.updatePaths({ newRelative: dist.relative.replace(distEntry, '') }));
    if (this._mainDistFile) {
      this._mainDistFile.replace(distEntry, '');
    }
  }

  stripOriginallySharedDir(originallySharedDir: string | undefined) {
    this.dists.forEach((distFile) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const newRelative = stripSharedDirFromPath(distFile.relative, originallySharedDir);
      distFile.updatePaths({ newRelative });
    });
    this._mainDistFile = this._mainDistFile
      ? stripSharedDirFromPath(this._mainDistFile, originallySharedDir)
      : this._mainDistFile;
  }

  /**
   * write dists files to the filesystem
   */
  async writeDists(
    component: Component,
    consumer: Consumer,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    writeLinks? = true
  ): Promise<string[] | null | undefined> {
    const dataToPersist = await this.getDistsToWrite(component, consumer.bitMap, consumer, writeLinks);
    if (!dataToPersist) return null;
    if (consumer) dataToPersist.addBasePath(consumer.getPath());
    await dataToPersist.persistAllToFS();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.dists.map((distFile) => distFile.path);
  }

  /**
   * write dist link files to the filesystem
   */
  async writeDistsLinks(component: Component, consumer: Consumer): Promise<void> {
    if (this.isEmpty() || !this.writeDistsFiles) return;
    const componentMap = consumer
      ? consumer.bitMap.getComponent(component.id, { ignoreVersion: true })
      : component.componentMap;
    if (!componentMap) throw new Error('writeDistsLinks expect componentMap to be defined');
    if (componentMap.origin === COMPONENT_ORIGINS.NESTED) return;
    const dataToPersist = await getLinksInDistToWrite(component, componentMap, consumer, consumer.bitMap);
    dataToPersist.addBasePath(consumer.getPath());
    await dataToPersist.persistAllToFS();
  }

  /**
   * In case there is a consumer and dist.entry should be stripped, it will be done before writing the files.
   * The originallySharedDir should be already stripped before accessing this method.
   */
  async getDistsToWrite(
    component: Component,
    bitMap: BitMap,
    consumer: Consumer | null | undefined,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    writeLinks? = true,
    componentWithDependencies?: ComponentWithDependencies
  ): Promise<DataToPersist | null | undefined> {
    if (this.isEmpty() || !this.writeDistsFiles) return null;
    const dataToPersist = new DataToPersist();
    const componentMap = consumer
      ? consumer.bitMap.getComponent(component.id, { ignoreVersion: true })
      : component.componentMap;
    if (!componentMap) throw new Error('getDistsToWrite expect componentMap to be defined');
    this.updateDistsPerWorkspaceConfig(component.id, consumer, componentMap);
    dataToPersist.addManyFiles(this.dists);
    if (writeLinks && componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
      const linksInDist = await getLinksInDistToWrite(
        component,
        componentMap,
        consumer,
        bitMap,
        componentWithDependencies
      );
      dataToPersist.merge(linksInDist);
    }

    return dataToPersist;
  }

  // In case there are dist files, we want to point the index to the main dist file, not to source.
  // This important since when you require a module without specify file, it will give you the file specified under this key
  // (or index.js if key not exists)
  calculateMainDistFile(mainSourceFile: PathOsBased): PathOsBased {
    if (this.writeDistsFiles && this.areDistsInsideComponentDir) {
      const getMainFile = (): string => {
        if (this._mainDistFile) return this._mainDistFile;
        // Take the only dist file if there is only one or search for one with the same name as the main source file
        if (this.dists && this.dists.length === 1) return this.dists[0].relative;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return searchFilesIgnoreExt(this.dists, mainSourceFile, 'relative');
      };
      const mainFile = getMainFile();
      if (mainFile) return path.join(DEFAULT_DIST_DIRNAME, mainFile);
    }
    return this._mainDistFile || mainSourceFile;
  }

  /**
   * authored components have the dists outside the components dir and they don't have rootDir.
   * it returns the file or dist file relative to consumer-root.
   */
  calculateDistFileForAuthored(componentFile: PathOsBased, consumer: Consumer, isMain: boolean): PathOsBased {
    if (this.isEmpty()) return componentFile;
    const getFileToSearch = (): PathOsBased => {
      if (!consumer.config._distEntry) return componentFile;
      const distEntryNormalized = path.normalize(consumer.config._distEntry);
      return componentFile.replace(`${distEntryNormalized}${path.sep}`, '');
    };
    const fileToSearch = getFileToSearch();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const distFile: string =
      isMain && this._mainDistFile ? this._mainDistFile : searchFilesIgnoreExt(this.dists, fileToSearch, 'relative');
    if (!distFile) return componentFile;
    const distTarget = consumer.config._distTarget || DEFAULT_DIST_DIRNAME;
    return path.join(distTarget, distFile);
  }

  toDistFilesModel(
    consumer: Consumer,
    originallySharedDir: PathLinux | null | undefined,
    isCompileSet: boolean
  ): { dists?: DistFileModel[]; mainDistFile?: PathOsBasedRelative | null | undefined } {
    // when a component is written to the filesystem, the originallySharedDir may be stripped, if it was, the
    // originallySharedDir is written in bit.map, and then set in consumerComponent.originallySharedDir when loaded.
    // similarly, when the dists are written to the filesystem, the dist.entry may be stripped, if it was, the
    // consumerComponent.dists.distEntryShouldBeStripped is set to true.
    // because the model always has the paths of the original author, in case part of the path was stripped, add it
    // back before saving to the model. this way, when the author updates the components, the paths will be correct.
    const addSharedDirAndDistEntry = (pathStr) => {
      const withSharedDir = originallySharedDir ? path.join(originallySharedDir, pathStr) : pathStr;
      const withDistEntry = this.distEntryShouldBeStripped
        ? path.join(consumer.config._distEntry as string, withSharedDir)
        : withSharedDir;
      return pathNormalizeToLinux(withDistEntry);
    };

    if (this.isEmpty() || !isCompileSet) return {};

    const dists = this.get().map((dist) => {
      return {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        name: dist.basename,
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        relativePath: addSharedDirAndDistEntry(dist.relative),
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        file: Source.from(dist.contents),
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        test: dist.test,
      };
    });
    const mainDistFile = this._mainDistFile ? addSharedDirAndDistEntry(this._mainDistFile) : this._mainDistFile;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return { dists, mainDistFile };
  }

  /**
   * the formula is distTarget + (customModuleDir - distEntry).
   * e.g. distTarget = 'dist', customDir = 'src', distEntry = 'src'.
   * node_path will be 'dist' + 'src' - 'src' = 'dist'.
   * another example, distTarget = 'dist', customDir = 'src/custom', distEntry = 'src'. result: "dist/custom"
   */
  static getNodePathDir(consumer: Consumer): string | undefined {
    const resolveModules = consumer.config._resolveModules;
    if (!resolveModules || !resolveModules.modulesDirectories || !resolveModules.modulesDirectories.length)
      return undefined;
    const distTarget = consumer.config._distTarget || DEFAULT_DIST_DIRNAME;
    const distEntry = consumer.config._distEntry;
    const nodePaths: PathOsBased[] = resolveModules.modulesDirectories.map((moduleDir) => {
      const isRelative = (str) => str.startsWith('./') || str.startsWith('../');
      if (!distEntry) return path.join(distTarget, moduleDir);
      const distEntryRelativeToModuleDir = pathRelativeLinux(distEntry, moduleDir);
      if (isRelative(distEntryRelativeToModuleDir)) {
        // moduleDir is outside the distEntry, ignore the distEntry
        return path.join(distTarget, moduleDir);
      }
      return path.join(distTarget, distEntryRelativeToModuleDir);
    });
    return nodePaths
      .map((nodePath) => consumer.toAbsolutePath(nodePath))
      .map(pathNormalizeToLinux)
      .join(NODE_PATH_SEPARATOR);
  }

  clone(): Dists {
    const clone: Dists = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    clone.dists = this.dists.map((d) => d.clone());
    return clone;
  }
}
