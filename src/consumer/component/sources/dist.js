/** @flow */
import AbstractVinyl from './abstract-vinyl';

/**
 * Dist paths are by default saved into the component's root-dir/dist. However, when dist is set in bit.json, the paths
 * are in the consumer-root/dist.target dir. If dist.entry is set, the dist.entry part is stripped from the dists paths.
 * (according to some additional conditions. See consumer-components.shouldDistEntryBeStripped()).
 * If there is originallySharedDir and the component is IMPORTED, it is stripped as well.
 *
 * These modifications of the paths are taken care in different stages depends on the scenario.
 * 1) using 'bit build'.
 * First, the sharedOriginallyDir is stripped (happens in consumer-component.build()). There are two scenarios here:
 *   a) the component wasn't change since the last build. It loads the dists from the model and strip the
 *      sharedOriginallyDir. (see the !needToRebuild case of build()).
 *   b) the component was changed. It re-builds it. The dists path are cloned from the files, since the files are
 *      sharedOriginallyDir stripped (because they loaded from the filesystem), so will be the dists files.
 * Next, the dist.entry is stripped. This is done when the dists are written into the file-system,  (see
 * consumer-component.writeDists()).
 *
 * 2) using 'bit import'.
 * When converting the component from model to consumer-component, the sharedOriginallyDir is stripped. (see
 * consumer-component.stripOriginallySharedDir() ).
 * Then, Before writing the dists to the file-system, the dist-entry is taken care of. (see
 * consumer-component.writeDists() ).
 *
 * 3) using 'bit link'.
 * When linking authored components, we generate an index file from node_modules/component-name to the main dist file.
 * It might happen during the import, when updateDistsPerConsumerBitJson() was running already, and it might happen
 * during the 'bit link' command. Therefore, before linking, the updateDistsPerConsumerBitJson() is running while making
 * sure it doesn't run twice.
 * (see node-modules-linker.linkToMainFile() and consumer-component.calculateMainDistFileForAuthored()).
 *
 * The opposite action is taken when a component is tagged. We load the component from the file-system while the dist
 * paths might be stripped from consumer dist.entry and originallySharedDir.
 * Then, before writing them to the model, we first add the originallySharedDir and then the dist.entry. We make sure
 * there were stripped before adding them. (See addSharedDirAndDistEntry function in scope.js and the comment there)
 */
export default class Dist extends AbstractVinyl {
  static loadFromParsedString(parsedString: Object) {
    if (!parsedString) return;
    const opts = super.loadFromParsedString(parsedString);
    return new Dist(opts);
  }

  static loadFromParsedStringArray(arr: Object[]) {
    if (!arr) return;
    return arr.map(this.loadFromParsedString);
  }
}
