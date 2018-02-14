// @flow
import path from 'path';
import Dist from '.';
import Consumer from '../../consumer';
import { DEFAULT_DIST_DIRNAME, COMPONENT_ORIGINS } from '../../../constants';
import type { PathLinux, PathOsBased } from '../../../utils/path';
import ComponentMap from '../../bit-map/component-map';
import logger from '../../../logger/logger';
import { writeLinksInDist } from '../../../links';
import { searchFilesIgnoreExt } from '../../../utils';
import { BitId } from '../../../bit-id';
import Component from '../consumer-component';

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
 * It might happen during the import, when updateDistsPerConsumerBitJson() was running already, and it might happen
 * during the 'bit link' command. Therefore, before linking, the updateDistsPerConsumerBitJson() is running while making
 * sure it doesn't run twice.
 * (see node-modules-linker.linkToMainFile() and calculateMainDistFileForAuthored()).
 *
 * The opposite action is taken when a component is tagged. We load the component from the file-system while the dist
 * paths might be stripped from consumer dist.entry and originallySharedDir.
 * Then, before writing them to the model, we first add the originallySharedDir and then the dist.entry. We make sure
 * there were stripped before adding them. (See addSharedDirAndDistEntry function in scope.js and the comment there)
 */
export default class Dists {
  dists: Dist[];
  writeDistsFiles: boolean = true; // changed only when importing a component
  areDistsInsideComponentDir: ?boolean = true;
  distEntryShouldBeStripped: ?boolean = false;
  _distsPathsAreUpdated: ?boolean = false; // makes sure to not update twice
  distsRootDir: ?string; // populated only after getDistDirForConsumer() is called
  constructor(dists?: ?(Dist[])) {
    this.dists = dists || []; // cover also case of null (when it comes from the model)
  }

  isEmpty() {
    return !this.dists.length;
  }

  get() {
    return this.dists;
  }

  getAsReadable() {
    return this.dists.map(file => file.toReadableString());
  }

  /**
   * When dists are written by a consumer (as opposed to isolated-environment for example), the dist-entry and
   * dist-target are taken into account for calculating the path.
   * By default, the dists path is inside the component. If dist attribute is populated in bit.json, the path is
   * relative to consumer root.
   */
  getDistDirForConsumer(consumer: Consumer, componentRootDir?: PathLinux): PathOsBased {
    const consumerBitJson = consumer.bitJson;
    let rootDir = componentRootDir || '.';
    if (consumer.shouldDistsBeInsideTheComponent()) {
      // should be relative to component
      this.distsRootDir = path.join(consumer.getPath(), rootDir, DEFAULT_DIST_DIRNAME);
    } else {
      // should be relative to consumer root
      if (consumerBitJson.distEntry) rootDir = rootDir.replace(consumerBitJson.distEntry, '');
      const distTarget = consumerBitJson.distTarget || DEFAULT_DIST_DIRNAME;
      this.areDistsInsideComponentDir = false;
      this.distsRootDir = path.join(consumer.getPath(), distTarget, rootDir);
    }
    return this.distsRootDir;
  }

  updateDistsPerConsumerBitJson(id: BitId, consumer: Consumer, componentMap: ComponentMap): void {
    if (this._distsPathsAreUpdated || this.isEmpty()) return;
    // $FlowFixMe
    const newDistBase = this.getDistDirForConsumer(consumer, componentMap.rootDir);
    const distEntry = consumer.bitJson.distEntry;
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
   * write dists file to the filesystem. In case there is a consumer and dist.entry should be stripped, it will be
   * done before writing the files. The originallySharedDir should be already stripped before accessing this method.
   */
  async writeDists(component: Component, consumer?: Consumer, writeLinks?: boolean = true): Promise<?(string[])> {
    if (this.isEmpty() || !this.writeDistsFiles) return null;
    let componentMap;
    if (consumer) {
      componentMap = consumer.bitMap.getComponent(component.id);
      this.updateDistsPerConsumerBitJson(component.id, consumer, componentMap);
    }
    const saveDist = this.dists.map(distFile => distFile.write());
    if (writeLinks && componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
      await writeLinksInDist(component, componentMap, consumer);
    }
    return Promise.all(saveDist);
  }

  // In case there are dist files, we want to point the index to the main dist file, not to source.
  // This important since when you require a module without specify file, it will give you the file specified under this key
  // (or index.js if key not exists)
  calculateMainDistFile(componentMainFile: PathOsBased): PathOsBased {
    if (this.writeDistsFiles && this.areDistsInsideComponentDir) {
      const mainFile = searchFilesIgnoreExt(this.dists, componentMainFile, 'relative', 'relative');
      if (mainFile) return path.join(DEFAULT_DIST_DIRNAME, mainFile);
    }
    return componentMainFile;
  }

  /**
   * authored components have the dists outside the components dir and they don't have rootDir.
   * it returns the main file or main dist file relative to consumer-root.
   */
  calculateMainDistFileForAuthored(componentMainFile: PathOsBased, consumer: Consumer): PathOsBased {
    if (this.isEmpty()) return componentMainFile;
    const getMainFileToSearch = (): PathOsBased => {
      if (!consumer.bitJson.distEntry) return componentMainFile;
      const distEntryNormalized = path.normalize(consumer.bitJson.distEntry);
      return componentMainFile.replace(`${distEntryNormalized}${path.sep}`, '');
    };
    const mainFileToSearch = getMainFileToSearch();
    const distMainFile = searchFilesIgnoreExt(this.dists, mainFileToSearch, 'relative', 'relative');
    if (!distMainFile) return componentMainFile;
    const distTarget = consumer.bitJson.distTarget || DEFAULT_DIST_DIRNAME;
    return path.join(distTarget, distMainFile);
  }
}
