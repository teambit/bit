import { ComponentID } from '@teambit/component-id';

/**
 * harmony registers an aspect by its id, which includes the version. the dependencies of an aspect are resolved
 * according to the dependency list of each dependent (see DependencyResolverMain.onLoadRequireableExtensionSubscriber).
 * as a result, two dependents that pin different versions of the same aspect get two instances of it. e.g. an app
 * uses the latest snap of an aspect, while another aspect the app uses is still pinned to an older version of it.
 * anything that the second aspect registers into the slots of its instance is invisible to the app, which reads the
 * slots of the other instance.
 *
 * this picker makes the aspects that are loaded together share one version of an aspect. it gets the ids level by
 * level, the requested ids first, then the dependencies of each level. the version of an aspect is picked at the
 * first level the aspect shows up in, and is used for the deeper levels as well, so the version that is closest to
 * the requested aspects wins.
 * when a level has more than one version of an aspect, none of them is closer than the others, e.g. two versions of
 * an env were requested. in such a case, the versions are kept as is, in that level and in the deeper ones.
 */
export class AspectVersionsPicker {
  private pickedIds = new Map<string, string>();
  private multipleVersions = new Set<string>();

  constructor(requestedIds: string[] = []) {
    this.pick(requestedIds);
  }

  /**
   * gets the ids of one level and returns the ids to load for them, in the same order. an id without a version (e.g.
   * a core aspect) is returned as is, unless a version of that aspect was already picked.
   */
  pick(ids: string[]): string[] {
    const idsWithoutVersion = ids.map((id) => ComponentID.tryFromString(id)?.toStringWithoutVersion());
    const versionedIdsOfLevel = new Map<string, Set<string>>();
    ids.forEach((id, index) => {
      const idWithoutVersion = idsWithoutVersion[index];
      if (!idWithoutVersion || id === idWithoutVersion) return;
      if (this.pickedIds.has(idWithoutVersion) || this.multipleVersions.has(idWithoutVersion)) return;
      const versionedIds = versionedIdsOfLevel.get(idWithoutVersion) || new Set<string>();
      versionedIds.add(id);
      versionedIdsOfLevel.set(idWithoutVersion, versionedIds);
    });
    versionedIdsOfLevel.forEach((versionedIds, idWithoutVersion) => {
      if (versionedIds.size === 1) this.pickedIds.set(idWithoutVersion, [...versionedIds][0]);
      else this.multipleVersions.add(idWithoutVersion);
    });
    return ids.map((id, index) => {
      const idWithoutVersion = idsWithoutVersion[index];
      return (idWithoutVersion && this.pickedIds.get(idWithoutVersion)) || id;
    });
  }
}
