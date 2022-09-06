import pMap from 'p-map';
import { BitError } from '@teambit/bit-error';
import { isHash } from '@teambit/component-version';
import { BitId, BitIds } from '../../bit-id';
import { BuildStatus } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import { ArtifactFiles, ArtifactSource, getArtifactsFiles } from '../../consumer/component/sources/artifact-files';
import Consumer from '../../consumer/consumer';
import logger from '../../logger/logger';
import ComponentObjects from '../component-objects';
import { getAllVersionHashes, getAllVersionsInfo, VersionInfo } from '../component-ops/traverse-versions';
import { ComponentNotFound, MergeConflict } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import UnmergedComponents from '../lanes/unmerged-components';
import { ModelComponent, Symlink, Version } from '../models';
import Lane from '../models/lane';
import { ComponentProps } from '../models/model-component';
import { BitObject, Ref } from '../objects';
import Repository from '../objects/repository';
import Scope from '../scope';
import { ExportMissingVersions } from '../exceptions/export-missing-versions';
import { ModelComponentMerger } from '../component-ops/model-components-merger';
import { concurrentComponentsLimit } from '../../utils/concurrency';
import { InMemoryCache } from '../../cache/in-memory-cache';
import { createInMemoryCache } from '../../cache/cache-factory';
import { pathNormalizeToLinux } from '../../utils';
import { getDivergeData } from '../component-ops/get-diverge-data';

export type ComponentTree = {
  component: ModelComponent;
  objects: BitObject[];
};

export type LaneTree = {
  lane: Lane;
  objects: BitObject[];
};

export type ComponentDef = {
  id: BitId;
  component: ModelComponent | null | undefined;
};

export type MergeResult = {
  mergedComponent: ModelComponent;
  mergedVersions: string[];
};

const MAX_AGE_UN_BUILT_COMPS_CACHE = 60 * 1000; // 1 min

export default class SourceRepository {
  scope: Scope;
  /**
   * if a component Version has build-status of "pending" or "failed", it goes to the remote to ask
   * for the component again, in case it was re-built.
   * to avoid too many trips to the remotes with the same components, we cache the results for a
   * small period of time (currently, 1 min).
   */
  private cacheUnBuiltIds: InMemoryCache<ModelComponent>;
  constructor(scope: Scope) {
    this.scope = scope;
    this.cacheUnBuiltIds = createInMemoryCache({ maxAge: MAX_AGE_UN_BUILT_COMPS_CACHE });
  }

  objects() {
    return this.scope.objects;
  }

  async getMany(ids: BitId[] | BitIds, versionShouldBeBuilt = false): Promise<ComponentDef[]> {
    if (!ids.length) return [];
    const concurrency = concurrentComponentsLimit();
    logger.trace(`sources.getMany, Ids: ${ids.join(', ')}`);
    logger.debug(`sources.getMany, ${ids.length} Ids`);
    return pMap(
      ids,
      async (id) => {
        const component = await this.get(id, versionShouldBeBuilt);
        return {
          id,
          component,
        };
      },
      { concurrency }
    );
  }

  /**
   * get component (local or external) from the scope.
   * if the id has a version but the Version object doesn't exist, it returns undefined.
   *
   * if versionShouldBeBuilt is true, it also verified that not only the version exists but it also
   * built successfully. otherwise, if the build failed or pending, the server may have a newer
   * version of this Version object, so we return undefined, to signal the importer that it needs
   * to be fetched from the remote again.
   */
  async get(bitId: BitId, versionShouldBeBuilt = false): Promise<ModelComponent | undefined> {
    const emptyComponent = ModelComponent.fromBitId(bitId);
    const component: ModelComponent | undefined = await this._findComponent(emptyComponent);
    if (!component) return undefined;
    if (!component.laneDataIsPopulated) {
      const currentLane = await this.scope.getCurrentLaneObject();
      await component.populateLocalAndRemoteHeads(this.objects(), currentLane);
      component.laneDataIsPopulated = true;
    }
    if (!bitId.hasVersion()) return component;

    const returnComponent = (version: Version): ModelComponent | undefined => {
      if (
        versionShouldBeBuilt &&
        !bitId.isLocal(this.scope.name) &&
        !component.hasLocalVersion(bitId.version as string) && // e.g. during tag
        (version.buildStatus === BuildStatus.Pending || version.buildStatus === BuildStatus.Failed)
      ) {
        const bitIdStr = bitId.toString();
        const fromCache = this.cacheUnBuiltIds.get(bitIdStr);
        if (fromCache) {
          return fromCache;
        }
        this.cacheUnBuiltIds.set(bitIdStr, component);
        return undefined;
      }
      return component;
    };

    // @ts-ignore
    const isSnap = isHash(bitId.version);
    const msg = `found ${bitId.toStringWithoutVersion()}, however version ${bitId.getVersion().versionNum}`;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (isSnap) {
      // @ts-ignore
      const snap = await this.objects().load(new Ref(bitId.version));
      if (!snap) {
        logger.debugAndAddBreadCrumb('sources.get', `${msg} object was not found on the filesystem`);
        return undefined;
      }
      return returnComponent(snap as Version);
    }
    // @ts-ignore
    if (!component.hasTagIncludeOrphaned(bitId.version)) {
      logger.debugAndAddBreadCrumb('sources.get', `${msg} is not in the component versions array`);
      return undefined;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const versionHash = component.versionsIncludeOrphaned[bitId.version];
    const version = (await this.objects().load(versionHash)) as Version;
    if (!version) {
      logger.debugAndAddBreadCrumb('sources.get', `${msg} object was not found on the filesystem`);
      return undefined;
    }
    // workaround an issue when a component has a dependency with the same id as the component itself
    version.dependencies = version.dependencies.filter((d) => !d.id.isEqualWithoutVersion(component.toBitId()));

    return returnComponent(version as Version);
  }

  isUnBuiltInCache(bitId: BitId): boolean {
    return Boolean(this.cacheUnBuiltIds.get(bitId.toString()));
  }

  async _findComponent(component: ModelComponent): Promise<ModelComponent | undefined> {
    try {
      const foundComponent = await this.objects().load(component.hash());
      if (foundComponent instanceof Symlink) {
        // eslint-disable-next-line @typescript-eslint/return-await
        return this._findComponentBySymlink(foundComponent);
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (foundComponent) return foundComponent;
    } catch (err: any) {
      logger.error(`findComponent got an error ${err}`);
    }
    logger.debug(`failed finding a component ${component.id()} with hash: ${component.hash().toString()}`);
    return undefined;
  }

  async _findComponentBySymlink(symlink: Symlink): Promise<ModelComponent | undefined> {
    const realComponentId: BitId = symlink.getRealComponentId();
    const realModelComponent = ModelComponent.fromBitId(realComponentId);
    const foundComponent = await this.objects().load(realModelComponent.hash());
    if (!foundComponent) {
      throw new Error(
        `error: found a symlink object "${symlink.id()}" that references to a non-exist component "${realComponentId.toString()}".
if you have the steps to reproduce the issue, please open a Github issue with the details.
to quickly fix the issue, please delete the object at "${this.objects().objectPath(symlink.hash())}"`
      );
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return foundComponent;
  }

  getObjects(id: BitId): Promise<ComponentObjects> {
    return this.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.collectObjects(this.objects());
    });
  }

  findOrAddComponent(props: ComponentProps): Promise<ModelComponent> {
    const comp = ModelComponent.from(props);
    return this._findComponent(comp).then((component) => {
      if (!component) return comp;
      return component;
    });
  }

  private transformArtifactsFromVinylToSource(artifactsFiles: ArtifactFiles[]): ArtifactSource[] {
    const artifacts: ArtifactSource[] = [];
    artifactsFiles.forEach((artifactFiles) => {
      const artifactsSource = ArtifactFiles.fromVinylsToSources(artifactFiles.vinyls);
      if (artifactsSource.length) artifactFiles.populateRefsFromSources(artifactsSource);
      artifacts.push(...artifactsSource);
    });
    return artifacts;
  }

  /**
   * given a consumer-component object, returns the Version representation.
   * useful for saving into the model or calculation the hash for comparing with other Version object.
   * among other things, it reverts the path manipulation that was done when a component was loaded
   * from the filesystem. it adds the originallySharedDir and strip the wrapDir.
   *
   * warning: Do not change anything on the consumerComponent instance! Only use its clone.
   *
   * @see model-components.toConsumerComponent() for the opposite action. (converting Version to
   * ConsumerComponent).
   */
  async consumerComponentToVersion(consumerComponent: ConsumerComponent): Promise<{ version: Version; files: any }> {
    const clonedComponent: ConsumerComponent = consumerComponent.clone();
    const files = consumerComponent.files.map((file) => {
      return {
        name: file.basename,
        relativePath: pathNormalizeToLinux(file.relative),
        file: file.toSourceAsLinuxEOL(),
        test: file.test,
      };
    });
    const version: Version = Version.fromComponent({
      component: clonedComponent,
      files: files as any,
    });
    // $FlowFixMe it's ok to override the pendingVersion attribute
    consumerComponent.pendingVersion = version as any; // helps to validate the version against the consumer-component

    return { version, files };
  }

  async enrichSource(consumerComponent: ConsumerComponent) {
    const objectRepo = this.objects();
    const objects = await this.getObjectsToEnrichSource(consumerComponent);
    objects.forEach((obj) => objectRepo.add(obj));
    return consumerComponent;
  }

  async getObjectsToEnrichSource(consumerComponent: ConsumerComponent): Promise<BitObject[]> {
    const component = await this.findOrAddComponent(consumerComponent);
    const version = await component.loadVersion(consumerComponent.id.version as string, this.objects());
    const artifactFiles = getArtifactsFiles(consumerComponent.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    version.extensions = consumerComponent.extensions;
    version.buildStatus = consumerComponent.buildStatus;
    const artifactObjects = artifacts.map((file) => file.source);
    return [version, ...artifactObjects];
  }

  async addSource({
    source,
    consumer,
    lane,
    shouldValidateVersion = false,
  }: {
    source: ConsumerComponent;
    consumer: Consumer;
    lane: Lane | null;
    shouldValidateVersion?: boolean;
  }): Promise<ModelComponent> {
    const objectRepo = this.objects();
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const component = await this.findOrAddComponent(source);

    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    const { version, files } = await this.consumerComponentToVersion(source);
    objectRepo.add(version);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, lane, objectRepo);

    const unmergedComponent = consumer.scope.objects.unmergedComponents.getEntry(component.name);
    if (unmergedComponent) {
      if (unmergedComponent.unrelated) {
        logger.debug(
          `sources.addSource, unmerged component "${component.name}". adding an unrelated entry ${unmergedComponent.head.hash}`
        );
        version.unrelated = { head: unmergedComponent.head, laneId: unmergedComponent.laneId };
      } else {
        version.addParent(unmergedComponent.head);
        logger.debug(
          `sources.addSource, unmerged component "${component.name}". adding a parent ${unmergedComponent.head.hash}`
        );
        version.log.message = version.log.message || UnmergedComponents.buildSnapMessage(unmergedComponent);
      }
      consumer.scope.objects.unmergedComponents.removeComponent(component.name);
    }
    objectRepo.add(component);

    files.forEach((file) => objectRepo.add(file.file));
    if (artifacts) artifacts.forEach((file) => objectRepo.add(file.source));
    if (shouldValidateVersion) version.validate();
    return component;
  }

  async addSourceFromScope(source: ConsumerComponent, lane: Lane | null): Promise<ModelComponent> {
    const objectRepo = this.objects();
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    const component = await this.findOrAddComponent(source);
    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    const { version, files } = await this.consumerComponentToVersion(source);
    objectRepo.add(version);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, lane, objectRepo);
    objectRepo.add(component);
    files.forEach((file) => objectRepo.add(file.file));
    if (artifacts) artifacts.forEach((file) => objectRepo.add(file.source));
    return component;
  }

  put({ component, objects }: ComponentTree): ModelComponent {
    logger.debug(`sources.put, id: ${component.id()}, versions: ${component.listVersions().join(', ')}`);
    const repo: Repository = this.objects();
    repo.add(component);
    objects.forEach((obj) => {
      repo.add(obj);
    });
    return component;
  }

  putObjects(objects: BitObject[]) {
    const repo: Repository = this.objects();
    objects.forEach((obj) => repo.add(obj));
  }

  /**
   * remove specified component versions from component.
   * if all versions of a component were deleted, delete also the component.
   * it doesn't persist anything to the filesystem.
   * (repository.persist() needs to be called at the end of the operation)
   */
  removeComponentVersions(
    component: ModelComponent,
    versions: string[],
    allVersionsObjects: Version[],
    lane: Lane | null,
    removeOnlyHead?: boolean
  ): void {
    logger.debug(`removeComponentVersion, component ${component.id()}, versions ${versions.join(', ')}`);
    const objectRepo = this.objects();
    const componentHadHead = component.hasHead();
    const laneItem = lane?.getComponentByName(component.toBitId());
    const removedRefs = versions.map((version) => {
      const ref = component.removeVersion(version);
      const versionObject = allVersionsObjects.find((v) => v.hash().isEqual(ref));
      const refStr = ref.toString();
      if (!versionObject) throw new Error(`removeComponentVersions failed finding a version object of ${refStr}`);
      // avoid deleting the Version object from the filesystem. see the e2e-case: "'snapping on a lane, switching to main, snapping and running "bit reset"'"
      // objectRepo.removeObject(ref);
      return ref;
    });

    const getNewHead = () => {
      if (!removeOnlyHead) {
        const divergeData = component.getDivergeData();
        if (divergeData.isDiverged()) {
          // if it's diverged, the Component object might have versions from the remote as part of the last import.
          // run snap.e2e - 'bit reset a diverge component' case to understand why it's better to pick the remoteHead
          // than the commonSnapBeforeDiverge. If it would set to commonSnapBeforeDiverge
          if (!component.remoteHead) throw new Error(`remoteHead must be set when component is diverged`);
          return component.remoteHead;
        }
        if (divergeData.commonSnapBeforeDiverge) {
          return divergeData.commonSnapBeforeDiverge;
        }
      }

      const head = component.head || laneItem?.head;
      if (!head) {
        return undefined;
      }
      const headVersion = allVersionsObjects.find((ver) => ver.hash().isEqual(head));
      return this.findHeadInExistingVersions(allVersionsObjects, component.id(), headVersion);
    };
    const refWasDeleted = (ref: Ref) => removedRefs.find((removedRef) => ref.isEqual(removedRef));
    if (component.head && refWasDeleted(component.head)) {
      const newHead = getNewHead();
      component.setHead(newHead);
    }
    if (laneItem && refWasDeleted(laneItem.head)) {
      const newHead = getNewHead();
      if (newHead) {
        laneItem.head = newHead;
      } else {
        lane?.removeComponent(component.toBitId());
      }
      component.laneHeadLocal = newHead;
      objectRepo.add(lane);
    }

    allVersionsObjects.forEach((versionObj) => {
      const wasDeleted = refWasDeleted(versionObj.hash());
      if (!wasDeleted && versionObj.parents.some((parent) => refWasDeleted(parent))) {
        throw new Error(
          `fatal: version "${versionObj
            .hash()
            .toString()}" of "${component.id()}" has parents that got deleted, which makes the history invalid.`
        );
      }
    });
    if (componentHadHead && !component.hasHead() && component.versionArray.length) {
      throw new Error(`fatal: "head" prop was removed from "${component.id()}", although it has versions`);
    }
    if (component.versionArray.length || component.hasHead() || component.laneHeadLocal) {
      objectRepo.add(component); // add the modified component object
    } else {
      objectRepo.removeObject(component.hash());
    }
    objectRepo.unmergedComponents.removeComponent(component.name);
  }

  /**
   * needed during untag.
   * given all removed versions, find the new head by traversing the versions objects until finding a parent
   * that was not removed. this is the new head of the component.
   */
  private findHeadInExistingVersions(versions: Version[], componentId: string, current?: Version): Ref | undefined {
    if (!current) {
      return undefined;
    }
    const parents = current.parents;
    if (!parents.length) {
      return undefined;
    }
    if (parents.length > 1) {
      // @todo: it needs to be optimized. we can check if both parents were removed, then traverse each one of them
      // and find the new head.
      throw new Error(
        `removeComponentVersions found multiple parents for a local (un-exported) version ${current.hash()} of ${componentId}`
      );
    }
    const parentRef = parents[0];
    const parentExists = versions.find((ver) => ver.hash().isEqual(parentRef));
    if (!parentExists) {
      return parentRef;
    }
    return this.findHeadInExistingVersions(versions, componentId, parentExists);
  }

  /**
   * get hashes needed for removing a component from a local scope.
   */
  async getRefsForComponentRemoval(bitId: BitId, includeVersions = true): Promise<Ref[]> {
    logger.debug(`sources.removeComponentById: ${bitId.toString()}, includeVersions: ${includeVersions}`);
    const component = await this.get(bitId);
    if (!component) return [];
    const objectRefs = [component.hash()];
    if (includeVersions) objectRefs.push(...component.versionArray);
    return objectRefs;
  }

  /**
   * this gets called only during export. for import, the merge is different, see
   * objects-writable-stream.mergeModelComponent()
   *
   * it doesn't save anything to the file-system.
   * only if the returned mergedVersions is not empty, the mergedComponent has changed.
   *
   * when dealing with lanes, exporting/importing lane's components, this function doesn't do much
   * if any. that's because the head is not saved on the ModelComponent but on the lane object.
   * to rephrase with other words,
   * this function merges an incoming modelComponent with an existing modelComponent, so if all
   * changes where done on a lane, this function will not do anything because modelComponent
   * hasn't changed.
   */
  async merge(incomingComp: ModelComponent, versionObjects: Version[]): Promise<MergeResult> {
    const existingComp = await this._findComponent(incomingComp);
    if (existingComp && incomingComp.isEqual(existingComp)) {
      return { mergedComponent: incomingComp, mergedVersions: [] };
    }
    // don't throw if not found because on export not all objects are sent to the remote
    const allVersionsInfo = await getAllVersionsInfo({ modelComponent: incomingComp, throws: false, versionObjects });
    const allHashes = allVersionsInfo.map((v) => v.ref).filter((ref) => ref) as Ref[];
    const incomingTagsAndSnaps = incomingComp.switchHashesWithTagsIfExist(allHashes);
    if (!existingComp) {
      this.throwForMissingVersions(allVersionsInfo, incomingComp);
      return { mergedComponent: incomingComp, mergedVersions: incomingTagsAndSnaps };
    }
    const hashesOfHistoryGraph = allVersionsInfo
      .map((v) => (v.isPartOfHistory ? v.ref : null))
      .filter((ref) => ref) as Ref[];
    const existingComponentHead = existingComp.getHead()?.clone();
    const existingHeadIsMissingInIncomingComponent = Boolean(
      incomingComp.hasHead() &&
        existingComponentHead &&
        !hashesOfHistoryGraph.find((ref) => ref.isEqual(existingComponentHead))
    );
    // currently it'll always be true. later, we might want to support exporting
    // dependencies from other scopes and then isIncomingFromOrigin could be false
    const isIncomingFromOrigin = incomingComp.scope === this.scope.name;
    const modelComponentMerger = new ModelComponentMerger(
      existingComp,
      incomingComp,
      false,
      isIncomingFromOrigin,
      existingHeadIsMissingInIncomingComponent
    );
    const { mergedComponent, mergedVersions } = await modelComponentMerger.merge();
    if (existingComponentHead || mergedComponent.hasHead()) {
      const mergedSnaps = await this.getMergedSnaps(existingComponentHead, incomingComp, versionObjects);
      mergedVersions.push(...mergedSnaps);
    }

    return { mergedComponent, mergedVersions };
  }

  private async getMergedSnaps(
    existingHead: Ref | undefined,
    incomingComp: ModelComponent,
    versionObjects: Version[]
  ): Promise<string[]> {
    const allIncomingVersionsInfoUntilExistingHead = await getAllVersionsInfo({
      modelComponent: incomingComp,
      throws: false,
      versionObjects,
      stopAt: existingHead,
    });
    const hashesOnly = allIncomingVersionsInfoUntilExistingHead
      .filter((v) => !v.tag) // only non-tag, the tagged are already part of the mergedVersion
      .map((v) => v.ref)
      .filter((ref) => ref) as Ref[];
    return hashesOnly.map((hash) => hash.toString());
  }

  private throwForMissingVersions(allVersionsInfo: VersionInfo[], component: ModelComponent) {
    const missingVersions = allVersionsInfo.filter((c) => !c.version).map((c) => c.tag || c.ref.toString());
    if (missingVersions.length) {
      throw new ExportMissingVersions(component.id(), missingVersions);
    }
  }

  async mergeComponents(
    components: ModelComponent[],
    versions: Version[]
  ): Promise<{ mergeResults: MergeResult[]; errors: Error[] }> {
    const mergeResults: MergeResult[] = [];
    const errors: Array<MergeConflict | ComponentNeedsUpdate> = [];
    await Promise.all(
      components.map(async (component) => {
        try {
          const result = await this.merge(component, versions);
          mergeResults.push(result);
        } catch (err: any) {
          if (err instanceof MergeConflict || err instanceof ComponentNeedsUpdate) {
            // don't throw. instead, get all components with merge-conflicts
            errors.push(err);
          } else {
            throw err;
          }
        }
      })
    );
    return { mergeResults, errors };
  }

  /**
   * the merge is needed only when both, local lane and remote lane have the same component with
   * a different head.
   * the different head can be a result of one component is ahead of the other (fast-forward is
   *  possible), or they both have diverged.
   *
   * 1a) fast-forward case, existing is ahead. existing has snapA => snapB, incoming has snapA.
   * we can just ignore the incoming.
   *
   * 1b) fast-forward case, incoming is ahead. existing has snapA, incoming has snapA => snapB.
   * we should update the existing head according to the incoming.
   *
   * 2) true-merge case, existing has snapA => snapB, incoming has snapA => snapC.
   *
   * in case this is a remote (the incoming component comes as a result of export):
   * throw an error telling the client to pull the lane from the remote in order to merge the
   * new snaps. the client during the merge process will create a snap-merge that is going to be
   * the new head, which eventually becoming the case 1b.
   *
   * in case this is a local (the incoming component comes as a result of import):
   * do not update the lane object. only save the data on the refs/remote/lane-name.
   *
   * keep in mind that this method may merge another non-checked out lane during "fetch" operation, so avoid mutating
   * the ModelComponent object with data from this lane object.
   */
  async mergeLane(
    lane: Lane,
    isImport: boolean // otherwise, it's coming from export
  ): Promise<{ mergeResults: MergeResult[]; mergeErrors: ComponentNeedsUpdate[]; mergeLane: Lane }> {
    logger.debug(`sources.mergeLane, lane: ${lane.toLaneId()}`);
    const repo = this.objects();
    const existingLaneWithSameId = await this.scope.loadLane(lane.toLaneId());
    const hasSameHash = existingLaneWithSameId && existingLaneWithSameId.hash().isEqual(lane.hash());
    if (existingLaneWithSameId && !hasSameHash) {
      throw new BitError(`unable to merge "${lane.toLaneId()}" lane. a lane with the same id already exists with a different hash.
you can either export to a different scope (use bit lane track) or create a new lane with a different name and export.
otherwise, to collaborate on the same lane as the remote, you'll need to remove the local lane and import the remote lane (bit lane import)`);
    }

    const existingLane = hasSameHash ? existingLaneWithSameId : await this.scope.loadLaneByHash(lane.hash());

    if (existingLane && !existingLaneWithSameId) {
      // the lane id has changed
      existingLane.scope = lane.scope;
      existingLane.name = lane.name;
    }
    const mergeResults: MergeResult[] = [];
    const mergeErrors: ComponentNeedsUpdate[] = [];
    await Promise.all(
      lane.components.map(async (component) => {
        const modelComponent = await this.get(component.id);
        if (!modelComponent) {
          throw new Error(`unable to merge lane ${lane.name}, the component ${component.id.toString()} was not found`);
        }
        const existingComponent = existingLane ? existingLane.components.find((c) => c.id.isEqual(component.id)) : null;
        if (!existingComponent) {
          // modelComponent.laneHeadLocal = component.head;
          const allVersions = await getAllVersionHashes(modelComponent, repo, undefined, component.head);
          if (existingLane) existingLane.addComponent(component);
          mergeResults.push({ mergedComponent: modelComponent, mergedVersions: allVersions.map((h) => h.toString()) });
          return;
        }
        if (existingComponent.head.isEqual(component.head)) {
          mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
          return;
        }
        const divergeResults = await getDivergeData(repo, modelComponent, component.head, existingComponent.head);
        if (divergeResults.isDiverged()) {
          if (isImport) {
            // do not update the local lane. later, suggest to snap-merge.
            mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
            return;
          }
          mergeErrors.push(new ComponentNeedsUpdate(component.id.toString(), existingComponent.head.toString()));
          return;
        }
        if (divergeResults.isRemoteAhead()) {
          existingComponent.head = component.head;
          mergeResults.push({
            mergedComponent: modelComponent,
            mergedVersions: divergeResults.snapsOnRemoteOnly.map((h) => h.toString()),
          });
          return;
        }
        // local is ahead, nothing to merge.
        mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
      })
    );

    return { mergeResults, mergeErrors, mergeLane: existingLane || lane };
  }
}
