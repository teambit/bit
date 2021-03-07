import logger from '../../logger/logger';
import { MergeConflict } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { ModelComponent } from '../models';

/**
 * the base component to save is the existingComponent because it might contain local data that
 * is not available in the remote component, such as the "state"/"orphanedVersions" properties.
 */
export class ModelComponentMerger {
  mergedVersions: string[] = [];
  isExport: boolean;
  constructor(
    private existingComponent: ModelComponent,
    private incomingComponent: ModelComponent,
    private isImport: boolean,
    private isIncomingFromOrigin: boolean, // import: incoming from original scope. export: component belong to current scope
    private existingHeadIsMissingInIncomingComponent?: boolean // needed for export only
  ) {
    this.isExport = !this.isImport;
  }

  /**
   * merge the existing component with the data from the incoming component.
   * in case of a conflict, it throws MergeConflict.
   */
  async merge(): Promise<{ mergedComponent: ModelComponent; mergedVersions: string[] }> {
    logger.debug(`model-component-merger.merge component ${this.incomingComponent.id()}`);
    this.throwComponentNeedsUpdateIfNeeded();
    const locallyChanged = await this.existingComponent.isLocallyChanged();
    this.throwMergeConflictIfNeeded(locallyChanged);
    this.replaceTagHashIfDifferentOnIncoming();
    this.moveTagToOrphanedIfNotExistOnOrigin();
    this.addNonExistTagFromIncoming();
    this.addOrphanedVersionFromIncoming();
    this.setHead(locallyChanged);
    this.deleteOrphanedVersionsOnExport();

    return { mergedComponent: this.existingComponent, mergedVersions: this.mergedVersions };
  }

  private deleteOrphanedVersionsOnExport() {
    // makes sure that components received with orphanedVersions, this property won't be saved
    if (this.isExport) this.existingComponent.orphanedVersions = {};
  }

  private setHead(locallyChanged: boolean) {
    const incomingHead = this.incomingComponent.getHead();
    if (!incomingHead) {
      return;
    }
    if (this.isIncomingFromOrigin && !locallyChanged) {
      this.existingComponent.setHead(incomingHead);
    }
  }

  private throwMergeConflictIfNeeded(locallyChanged: boolean) {
    if (!this.isIncomingFromOrigin) {
      return; // if it's not from origin, the tag is not going to save in "versions" anyway.
    }
    if (this.isImport && !locallyChanged) {
      // since the component wasn't change, we don't mind replacing it with what we got from the remote
      return;
    }
    if (!this.incomingComponent.compatibleWith(this.existingComponent, this.isImport)) {
      const conflictVersions = this.incomingComponent.diffWith(this.existingComponent, this.isImport);
      throw new MergeConflict(this.incomingComponent.id(), conflictVersions);
    }
  }

  private throwComponentNeedsUpdateIfNeeded() {
    if (
      this.isExport &&
      this.existingHeadIsMissingInIncomingComponent &&
      this.incomingComponent.compatibleWith(this.existingComponent, this.isImport) // otherwise, it should throw MergeConflict below
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      throw new ComponentNeedsUpdate(this.incomingComponent.id(), this.existingComponent.head!.toString());
    }
  }

  private replaceTagHashIfDifferentOnIncoming() {
    if (!this.isIncomingFromOrigin) {
      return; // no need to replace. the existing is the correct one.
    }
    // in case the existing version hash is different than incoming version hash, use the incoming
    // version because we hold the incoming component from a remote as the source of truth
    Object.keys(this.existingComponent.versions).forEach((existingVersion) => {
      if (
        this.incomingComponent.versions[existingVersion] &&
        !this.existingComponent.versions[existingVersion].isEqual(this.incomingComponent.versions[existingVersion])
      ) {
        this.existingComponent.setVersion(existingVersion, this.incomingComponent.versions[existingVersion]);
        this.mergedVersions.push(existingVersion);
      }
    });
  }

  private moveTagToOrphanedIfNotExistOnOrigin() {
    Object.keys(this.existingComponent.versions).forEach((existingVersion) => {
      if (
        !this.incomingComponent.versions[existingVersion] &&
        this.isImport &&
        this.isIncomingFromOrigin &&
        !this.existingComponent.hasLocalTag(existingVersion)
      ) {
        const ref = this.existingComponent.versions[existingVersion];
        delete this.existingComponent.versions[existingVersion];
        this.existingComponent.setOrphanedVersion(existingVersion, ref);
      }
    });
  }

  private addNonExistTagFromIncoming() {
    // in case the incoming component has versions that are not in the existing component, copy them
    Object.keys(this.incomingComponent.versions).forEach((incomingVersion) => {
      if (this.existingComponent.versions[incomingVersion]) {
        return;
      }
      if (this.isIncomingFromOrigin) {
        // it's legit, add the tag
        this.existingComponent.setVersion(incomingVersion, this.incomingComponent.versions[incomingVersion]);
      } else {
        // happens when retrieved from the cache of the remote.
        this.existingComponent.setOrphanedVersion(incomingVersion, this.incomingComponent.versions[incomingVersion]);
      }
      this.mergedVersions.push(incomingVersion);
    });
  }

  /**
   * a remote may have a version not in the "versions" array but in the "orphanedVersions".
   * it happens when it got that version not from the original remote but from a cache of a
   * different remote. locally, we need this data to not throw an error later about missing objects
   */
  private addOrphanedVersionFromIncoming() {
    if (this.isExport) {
      return; // we shouldn't get any orphaned during export.
    }
    Object.keys(this.incomingComponent.orphanedVersions).forEach((incomingVersion) => {
      if (this.existingComponent.versions[incomingVersion]) return; // no need to have the orphaned
      this.existingComponent.setOrphanedVersion(
        incomingVersion,
        this.incomingComponent.orphanedVersions[incomingVersion]
      );
      this.mergedVersions.push(incomingVersion);
    });
  }
}
