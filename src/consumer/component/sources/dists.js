// @flow
import path from 'path';
import Dist from './dist';
import type Consumer from '../../consumer';
import { DEFAULT_DIST_DIRNAME, COMPONENT_ORIGINS, NODE_PATH_SEPARATOR } from '../../../constants';
import type { PathLinux, PathOsBased, PathOsBasedRelative } from '../../../utils/path';
import type ComponentMap from '../../bit-map/component-map';
import logger from '../../../logger/logger';
import { getLinksInDistToWrite } from '../../../links';
import { searchFilesIgnoreExt, pathRelativeLinux } from '../../../utils';
import { BitId } from '../../../bit-id';
import type Component from '../consumer-component';
import { pathNormalizeToLinux } from '../../../utils/path';
import Source from '../../../scope/models/source';
import type CompilerExtension from '../../../extensions/compiler-extension';
import type { DistFileModel } from '../../../scope/models/version';
import DataToPersist from './data-to-persist';
import WorkspaceConfig from '../../config/workspace-config';

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
  writeDistsFiles: boolean = true; // changed only when importing a component
  areDistsInsideComponentDir: ?boolean = true;
  distEntryShouldBeStripped: ?boolean = false;
  _distsPathsAreUpdated: ?boolean = false; // makes sure to not update twice
  distsRootDir: ?PathOsBasedRelative; // populated only after getDistDirForConsumer() is called
  constructor(dists?: ?(Dist[])) {
    this.dists = dists || []; // cover also case of null (when it comes from the model)
  }

  isEmpty() {
    return !this.dists.length;
  }

  get() {
    return this.dists;
  }

  getAsReadable(): string[] {
    return this.dists.map(file => file.toReadableString());
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

  static getDistDirWhenDistIsOutsideCompDir(
    workspaceConfig: WorkspaceConfig,
    componentRootDir: PathLinux
  ): PathOsBasedRelative {
    if (workspaceConfig.distEntry) componentRootDir = componentRootDir.replace(workspaceConfig.distEntry, '');
    const distTarget = workspaceConfig.distTarget || DEFAULT_DIST_DIRNAME;
    return path.join(distTarget, componentRootDir);
  }

  getDistDir(consumer: ?Consumer, componentRootDir: PathLinux): PathOsBasedRelative {
    if (consumer) return this.getDistDirForConsumer(consumer, componentRootDir);
    this.distsRootDir = path.join(componentRootDir, DEFAULT_DIST_DIRNAME);
    return this.distsRootDir;
  }

  updateDistsPerWorkspaceConfig(id: BitId, consumer: ?Consumer, componentMap: ComponentMap): void {
    if (this._distsPathsAreUpdated || this.isEmpty()) return;
    const newDistBase = this.getDistDir(consumer, componentMap.getRootDir());
    const distEntry = consumer ? consumer.config.distEntry : undefined;
    const shouldDistEntryBeStripped = () => {
      if (!distEntry || componentMap.origin === COMPONENT_ORIGINS.NESTED) return false;
      const areAllDistsStartWithDistEntry = () => {
        return this.dists.map(dist => dist.relative.startsWith(distEntry)).every(x => x);
      };
      if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
        return areAllDistsStartWithDistEntry();
      }
      // it's IMPORTED. We first check that rootDir starts with dist.entry, it happens mostly when a user imports into
      // a specific directory (e.g. bit import --path src/). Then, we make sure all dists files start with that
      // dist.entry. In a case when originallySharedDir is the same as dist.entry, this second check returns false.
      // $FlowFixMe
      return componentMap.rootDir.startsWith(distEntry) && areAllDistsStartWithDistEntry();
    };
    const distEntryShouldBeStripped = shouldDistEntryBeStripped();
    if (distEntryShouldBeStripped) {
      // $FlowFixMe
      logger.debug(`stripping dist.entry "${distEntry}" from ${id}`);
      this.distEntryShouldBeStripped = true;
    }
    const getNewRelative = (dist) => {
      if (distEntryShouldBeStripped) {
        // $FlowFixMe distEntry is set when distEntryShouldBeStripped
        return dist.relative.replace(distEntry, '');
      }
      return dist.relative;
    };
    this.dists.forEach(dist => dist.updatePaths({ newBase: newDistBase, newRelative: getNewRelative(dist) }));
    this._distsPathsAreUpdated = true;
  }

  stripOriginallySharedDir(originallySharedDir: string, pathWithoutSharedDir: Function) {
    this.dists.forEach((distFile) => {
      const newRelative = pathWithoutSharedDir(distFile.relative, originallySharedDir);
      distFile.updatePaths({ newBase: distFile.base, newRelative });
    });
  }

  /**
   * write dists files to the filesystem
   */
  async writeDists(component: Component, consumer?: Consumer, writeLinks?: boolean = true): Promise<?(string[])> {
    const dataToPersist = await this.getDistsToWrite(component, consumer, writeLinks);
    if (!dataToPersist) return null;
    if (consumer) dataToPersist.addBasePath(consumer.getPath());
    await dataToPersist.persistAllToFS();
    return this.dists.map(distFile => distFile.path);
  }

  /**
   * In case there is a consumer and dist.entry should be stripped, it will be done before writing the files.
   * The originallySharedDir should be already stripped before accessing this method.
   */
  async getDistsToWrite(
    component: Component,
    consumer?: Consumer,
    writeLinks?: boolean = true
  ): Promise<?DataToPersist> {
    if (this.isEmpty() || !this.writeDistsFiles) return null;
    if (writeLinks && !consumer) throw new Error('getDistsToWrite expects to get consumer when writeLinks is true');
    const dataToPersist = new DataToPersist();
    let componentMap;
    if (consumer) {
      componentMap = consumer.bitMap.getComponent(component.id, { ignoreVersion: true });
      this.updateDistsPerWorkspaceConfig(component.id, consumer, componentMap);
    }
    dataToPersist.addManyFiles(this.dists);
    if (writeLinks && componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
      const linksInDist = await getLinksInDistToWrite(component, componentMap, consumer);
      dataToPersist.merge(linksInDist);
    }

    return dataToPersist;
  }

  // In case there are dist files, we want to point the index to the main dist file, not to source.
  // This important since when you require a module without specify file, it will give you the file specified under this key
  // (or index.js if key not exists)
  calculateMainDistFile(componentMainFile: PathOsBased): PathOsBased {
    if (this.writeDistsFiles && this.areDistsInsideComponentDir) {
      // Take the only dist file if there is only one or search for one with the same name as the main source file
      const mainFile =
        this.dists && this.dists.length === 1
          ? this.dists[0].relative
          : searchFilesIgnoreExt(this.dists, componentMainFile, 'relative');
      if (mainFile) return path.join(DEFAULT_DIST_DIRNAME, mainFile);
    }
    return componentMainFile;
  }

  /**
   * authored components have the dists outside the components dir and they don't have rootDir.
   * it returns the file or dist file relative to consumer-root.
   */
  calculateDistFileForAuthored(componentFile: PathOsBased, consumer: Consumer): PathOsBased {
    if (this.isEmpty()) return componentFile;
    const getFileToSearch = (): PathOsBased => {
      if (!consumer.config.distEntry) return componentFile;
      const distEntryNormalized = path.normalize(consumer.config.distEntry);
      return componentFile.replace(`${distEntryNormalized}${path.sep}`, '');
    };
    const fileToSearch = getFileToSearch();
    const distFile = searchFilesIgnoreExt(this.dists, fileToSearch, 'relative');
    if (!distFile) return componentFile;
    const distTarget = consumer.config.distTarget || DEFAULT_DIST_DIRNAME;
    return path.join(distTarget, distFile);
  }

  toDistFilesModel(
    consumer: Consumer,
    originallySharedDir: ?PathLinux,
    compiler: ?CompilerExtension
  ): ?(DistFileModel[]) {
    // when a component is written to the filesystem, the originallySharedDir may be stripped, if it was, the
    // originallySharedDir is written in bit.map, and then set in consumerComponent.originallySharedDir when loaded.
    // similarly, when the dists are written to the filesystem, the dist.entry may be stripped, if it was, the
    // consumerComponent.dists.distEntryShouldBeStripped is set to true.
    // because the model always has the paths of the original author, in case part of the path was stripped, add it
    // back before saving to the model. this way, when the author updates the components, the paths will be correct.
    const addSharedDirAndDistEntry = (pathStr) => {
      const withSharedDir = originallySharedDir ? path.join(originallySharedDir, pathStr) : pathStr;
      const withDistEntry = this.distEntryShouldBeStripped // $FlowFixMe
        ? path.join(consumer.config.distEntry, withSharedDir)
        : withSharedDir;
      return pathNormalizeToLinux(withDistEntry);
    };

    if (this.isEmpty() || !compiler) return null;

    return this.get().map((dist) => {
      return {
        name: dist.basename,
        relativePath: addSharedDirAndDistEntry(dist.relative), // $FlowFixMe
        file: Source.from(dist.contents),
        test: dist.test
      };
    });
  }

  /**
   * the formula is distTarget + (customModuleDir - distEntry).
   * e.g. distTarget = 'dist', customDir = 'src', distEntry = 'src'.
   * node_path will be 'dist' + 'src' - 'src' = 'dist'.
   * another example, distTarget = 'dist', customDir = 'src/custom', distEntry = 'src'. result: "dist/custom"
   */
  static getNodePathDir(consumer: Consumer): ?string {
    const resolveModules = consumer.config.resolveModules;
    if (!resolveModules || !resolveModules.modulesDirectories || !resolveModules.modulesDirectories.length) return null;
    const distTarget = consumer.config.distTarget || DEFAULT_DIST_DIRNAME;
    const distEntry = consumer.config.distEntry;
    const nodePaths: PathOsBased[] = resolveModules.modulesDirectories.map((moduleDir) => {
      const isRelative = str => str.startsWith('./') || str.startsWith('../');
      if (!distEntry) return path.join(distTarget, moduleDir);
      const distEntryRelativeToModuleDir = pathRelativeLinux(distEntry, moduleDir);
      if (isRelative(distEntryRelativeToModuleDir)) {
        // moduleDir is outside the distEntry, ignore the distEntry
        return path.join(distTarget, moduleDir);
      }
      return path.join(distTarget, distEntryRelativeToModuleDir);
    });
    return nodePaths
      .map(nodePath => consumer.toAbsolutePath(nodePath))
      .map(pathNormalizeToLinux)
      .join(NODE_PATH_SEPARATOR);
  }
}
