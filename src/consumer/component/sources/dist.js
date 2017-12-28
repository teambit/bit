/** @flow */
import AbstractVinyl from './abstract-vinyl';

/**
 * Dist paths are by default saved into the component's root-dir/dist. However, when dist is set in bit.json, the paths
 * are in the consumer-root/dist.target dir. If dist.entry is set the paths should be stripped from dist.entry.
 * If there is originallySharedDir, it should be stripped as well.
 *
 * These modifications of the paths are taken care in different stages depends on the scenario.
 * 1) using 'bit build'.
 * If the component wasn't change since the last build, it'll load the dists from the model, strip the
 * sharedOriginallyDir and then write them. (See consumer-component.build()).
 * If the component was changed, it will re-build it. The dists path are cloned from the files, since the files are
 * sharedOriginallyDir stripped, so will be the dists files. The only thing needed is to strip the dist.entry, which is
 * done after getting the files from the compiler. (See consumer-component.buildIfNeeded()).
 * 2) using 'bit import'.
 * When converting the component from model to consumer-component, the sharedOriginallyDir is stripped. (see
 * consumer-component.stripOriginallySharedDir() )/
 * Then, Before writing the dists to the file-system, the dist-entry is taken care of. (see
 * consumer-component.updateDistsPerConsumerBitJson() ).
 *
 * The opposite action is taken when a component is tagged. We load the component from the file-system while the dist
 * paths are stripped from consumer dist.entry and originallySharedDir. Then, before writing them to the model, we add
 * back the dist.entry and originallySharedDir. (See addSharedDirAndDistEntry function in scope.js)
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
