import logger from '../../logger/logger';
import { MergeConflict } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { ModelComponent } from '../models';

export class ModelComponentMerger {
  mergedComponent: ModelComponent;
  mergedVersions: string[] = [];
  constructor(
    private existingComponent: ModelComponent,
    private incomingComponent: ModelComponent,
    private existingComponentTagsAndSnaps: string[],
    private incomingComponentTagsAndSnaps: string[],
    private isImport: boolean,
    private isIncomingFromOrigin: boolean,
    private existingHeadIsMissingInIncomingComponent: boolean
  ) {
    // the base component to save is the existingComponent because it might contain local data that
    // is not available in the remote component, such as the "state" property.
    this.mergedComponent = this.existingComponent;
  }

  get isExport() {
    return !this.isImport;
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
    this.addSnapsToMergedVersions();
    this.addNonExistTagFromIncoming();
    this.setHead(locallyChanged);
    this.deleteOrphanedVersionsOnExport();

    return { mergedComponent: this.mergedComponent, mergedVersions: this.mergedVersions };
  }

  private deleteOrphanedVersionsOnExport() {
    // makes sure that components received with orphanedVersions, this property won't be saved
    if (this.isExport) this.mergedComponent.orphanedVersions = {};
  }

  private addSnapsToMergedVersions() {
    if (this.incomingComponent.hasHead()) {
      const mergedSnaps = this.incomingComponentTagsAndSnaps.filter(
        (tagOrSnap) =>
          !this.existingComponentTagsAndSnaps.includes(tagOrSnap) && !this.mergedVersions.includes(tagOrSnap)
      );
      this.mergedVersions.push(...mergedSnaps);
    }
  }

  private setHead(locallyChanged: boolean) {
    if (this.incomingComponent.remoteHead) this.mergedComponent.remoteHead = this.incomingComponent.remoteHead;

    const componentHead = this.incomingComponent.getHead();
    if (componentHead) {
      // when importing, do not override the head unless the incoming is ahead or it wasn't changed
      if (
        this.isExport ||
        !this.existingHeadIsMissingInIncomingComponent ||
        (this.isIncomingFromOrigin && !locallyChanged)
      ) {
        this.mergedComponent.setHead(componentHead);
      }
    }
  }

  private throwMergeConflictIfNeeded(locallyChanged: boolean) {
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
    // in case the existing version hash is different than incoming version hash, use the incoming
    // version because we hold the incoming component from a remote as the source of truth
    Object.keys(this.existingComponent.versions).forEach((existingVersion) => {
      if (
        this.incomingComponent.versions[existingVersion] &&
        this.existingComponent.versions[existingVersion].toString() !==
          this.incomingComponent.versions[existingVersion].toString()
      ) {
        this.mergedComponent.versions[existingVersion] = this.incomingComponent.versions[existingVersion];
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
        this.mergedComponent.orphanedVersions[existingVersion] = this.existingComponent.versions[existingVersion];
        delete this.existingComponent.versions[existingVersion];
      }
    });
  }

  private addNonExistTagFromIncoming() {
    // in case the incoming component has versions that are not in the existing component, copy them
    Object.keys(this.incomingComponent.versions).forEach((incomingVersion) => {
      if (!this.existingComponent.versions[incomingVersion]) {
        if (this.isExport || this.isIncomingFromOrigin) {
          this.mergedComponent.versions[incomingVersion] = this.incomingComponent.versions[incomingVersion];
          delete this.mergedComponent.orphanedVersions[incomingVersion];
        } else {
          // happens on import only when retrieved from the cache of the remote.
          this.mergedComponent.orphanedVersions[incomingVersion] = this.incomingComponent.versions[incomingVersion];
        }
        this.mergedVersions.push(incomingVersion);
      }
    });
  }
}
