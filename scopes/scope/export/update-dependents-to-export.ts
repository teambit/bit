import { compact } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';

export type UpdateDependentsToExportParams = {
  localUpdateDependents: ComponentID[];
  remoteUpdateDependents: ComponentID[];
  /**
   * the visible components of the local lane. a hidden entry that was promoted to a visible one is not hidden anymore.
   */
  localComponents: ComponentIdList;
  /**
   * true when a snap from a scope added new hidden entries to the lane (`overrideUpdateDependents`). otherwise, a local
   * entry that is missing from the remote was removed there (e.g. in the UI) and is not exported.
   */
  includeNewEntries: boolean;
  /**
   * whether the local head of a hidden entry is a descendant of its remote head (e.g. a local cascade snap).
   */
  isLocalAhead: (localId: ComponentID, remoteId: ComponentID) => Promise<boolean>;
};

/**
 * returns the hidden lane entries (`lane.updateDependents`) to export.
 * the remote owns these entries. a workspace only updates the existing ones (a cascade snap), and only a snap from a
 * scope adds new ones. so the list starts from the remote list, and a local head replaces the remote head only when
 * it's ahead of it. when diverged, the remote head is kept.
 * an older remote replaces its whole list with the exported one, and only when the lane has `overrideUpdateDependents`.
 * this is why the exported list must be complete, and must not include entries that were removed on the remote.
 */
export async function getUpdateDependentsToExport({
  localUpdateDependents,
  remoteUpdateDependents,
  localComponents,
  includeNewEntries,
  isLocalAhead,
}: UpdateDependentsToExportParams): Promise<ComponentID[]> {
  const localIds = ComponentIdList.fromArray(localUpdateDependents);
  const remoteIds = ComponentIdList.fromArray(remoteUpdateDependents);
  const fromRemote = await Promise.all(
    remoteUpdateDependents.map(async (remoteId) => {
      if (localComponents.hasWithoutVersion(remoteId)) return undefined;
      const localId = localIds.searchWithoutVersion(remoteId);
      if (!localId || localId.version === remoteId.version) return remoteId;
      return (await isLocalAhead(localId, remoteId)) ? localId : remoteId;
    })
  );
  const newEntries = includeNewEntries ? localIds.filter((localId) => !remoteIds.hasWithoutVersion(localId)) : [];
  return [...compact(fromRemote), ...newEntries];
}
