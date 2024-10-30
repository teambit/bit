import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { isHash } from '@teambit/component-version';
import pMap from 'p-map';
import { BuildStatus } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import logger from '../../logger/logger';
import ComponentObjects from '../component-objects';
import {
  getAllVersionHashes,
  getAllVersionsInfo,
  getSubsetOfVersionParents,
  getVersionParentsFromVersion,
  VersionInfo,
} from '../component-ops/traverse-versions';
import { ComponentNotFound, MergeConflict } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { ModelComponent, Source, Symlink, Version } from '../models';
import Lane, { LaneComponent } from '../models/lane';
import { ComponentProps } from '../models/model-component';
import { BitObject, Ref } from '../objects';
import Repository from '../objects/repository';
import Scope from '../scope';
import { ExportMissingVersions } from '../exceptions/export-missing-versions';
import { ModelComponentMerger } from '../component-ops/model-components-merger';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { InMemoryCache, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
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
  id: ComponentID;
  component: ModelComponent | null | undefined;
};

export type ComponentExistence = {
  id: ComponentID;
  exists: boolean;
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

  async getMany(ids: ComponentID[], versionShouldBeBuilt = false): Promise<ComponentDef[]> {
    if (!ids.length) return [];
    const concurrency = concurrentComponentsLimit();
    logger.trace(`sources.getMany, Ids: ${ids.join(', ')}`);
    logger.trace(`sources.getMany, ${ids.length} Ids`);
    return pMapPool(
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

  async existMany(ids: ComponentID[]): Promise<ComponentExistence[]> {
    if (!ids.length) return [];
    const concurrency = concurrentComponentsLimit();
    logger.trace(`sources.getMany, Ids: ${ids.join(', ')}`);
    logger.debug(`sources.getMany, ${ids.length} Ids`);
    return pMapPool(ids, async (id) => this.exists(id), { concurrency });
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
  async get(bitId: ComponentID, versionShouldBeBuilt = false): Promise<ModelComponent | undefined> {
    const emptyComponent = ModelComponent.fromBitId(bitId);
    const component: ModelComponent | undefined = await this._findComponent(emptyComponent);
    if (!component) return undefined;
    if (!component.laneDataIsPopulated) {
      const currentLane = await this.scope.getCurrentLaneObject();
      await component.populateLocalAndRemoteHeads(this.objects(), currentLane);
      component.laneDataIsPopulated = true;
    }
    if (!bitId.hasVersion()) return component;

    const returnComponent = async (version: Version): Promise<ModelComponent | undefined> => {
      if (
        bitId.isLocal(this.scope.name) ||
        version.buildStatus === BuildStatus.Succeed ||
        version.buildStatus === BuildStatus.Skipped ||
        !versionShouldBeBuilt
      ) {
        return component;
      }
      const hash = component.getRef(bitId.version as string);
      if (!hash) throw new Error(`sources.get: unable to get has for ${bitId.toString()}`);
      const hasLocalVersion = this.scope.stagedSnaps.has(hash.toString());
      if (hasLocalVersion) {
        // no point to go to the remote, it's local.
        return component;
      }
      const bitIdStr = bitId.toString();
      const fromCache = this.cacheUnBuiltIds.get(bitIdStr);
      if (fromCache) {
        return fromCache;
      }
      this.cacheUnBuiltIds.set(bitIdStr, component);
      logger.trace(
        `sources.get, found ${bitId.toString()}, however the version has build-status of ${version.buildStatus}`
      );
      return undefined;
    };

    const isSnap = isHash(bitId.version);
    const msg = `found ${bitId.toStringWithoutVersion()}, however version ${bitId._legacy.getVersion().versionNum}`;
    if (isSnap) {
      // @ts-ignore
      const snap = await this.objects().load(new Ref(bitId.version));
      if (!snap) {
        logger.trace(`sources.get, ${msg} object was not found on the filesystem`);
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
      logger.trace(`sources.get, ${msg} object was not found on the filesystem`);
      return undefined;
    }
    // workaround an issue when a component has a dependency with the same id as the component itself
    version.dependencies = version.dependencies.filter((d) => !d.id.isEqualWithoutVersion(component.toComponentId()));

    return returnComponent(version as Version);
  }

  /**
   * if the id has a version and the Version object doesn't exist, it returns false.
   */
  async exists(bitId: ComponentID): Promise<ComponentExistence> {
    const emptyComponent = ModelComponent.fromBitId(bitId);
    const component: ModelComponent | undefined = await this._findComponent(emptyComponent);
    const isExists = async () => {
      if (!component) return false;
      if (!bitId.hasVersion()) return true;
      const ver = bitId.version as string;
      const isSnap = isHash(ver);
      if (isSnap) {
        return this.objects().has(new Ref(ver));
      }
      const versionHash = component.versionsIncludeOrphaned[ver];
      if (!versionHash) {
        return false;
      }
      return this.objects().has(new Ref(ver));
    };
    const exists = await isExists();
    return {
      id: bitId,
      exists,
    };
  }

  isUnBuiltInCache(bitId: ComponentID): boolean {
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
    logger.trace(`failed finding a component ${component.id()} with hash: ${component.hash().toString()}`);
    return undefined;
  }

  async _findComponentBySymlink(symlink: Symlink): Promise<ModelComponent | undefined> {
    const realComponentId = symlink.getRealComponentId();
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

  getObjects(id: ComponentID): Promise<ComponentObjects> {
    return this.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.collectObjects(this.objects());
    });
  }

  async findOrAddComponent(consumerComponent: ConsumerComponent): Promise<ModelComponent> {
    if (consumerComponent.modelComponent) return consumerComponent.modelComponent;
    const propsFromComp = this.getPropsFromConsumerComp(consumerComponent);
    const comp = ModelComponent.from(propsFromComp);
    return this._findComponent(comp).then((component) => {
      if (!component) return comp;
      return component;
    });
  }

  private getPropsFromConsumerComp(comp: ConsumerComponent): ComponentProps {
    return {
      name: comp.id.fullName,
      scope: comp.id.scope,
      lang: comp.lang,
      bindingPrefix: comp.bindingPrefix,
      deprecated: comp.deprecated,
      schema: comp.schema,
    };
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
  async consumerComponentToVersion(consumerComponent: ConsumerComponent): Promise<{
    version: Version;
    files: any;
    flattenedEdges?: Source;
  }> {
    const clonedComponent: ConsumerComponent = consumerComponent.clone();
    const files = consumerComponent.files.map((file) => {
      return {
        name: file.basename,
        relativePath: pathNormalizeToLinux(file.relative),
        file: file.toSourceAsLinuxEOL(),
        test: file.test,
      };
    });

    const flattenedEdges = Version.flattenedEdgeToSource(consumerComponent.flattenedEdges);

    const version: Version = Version.fromComponent({
      component: clonedComponent,
      files: files as any,
      flattenedEdges,
    });
    // $FlowFixMe it's ok to override the pendingVersion attribute
    consumerComponent.pendingVersion = version as any; // helps to validate the version against the consumer-component

    return { version, files, flattenedEdges };
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
  async removeComponentVersions(
    component: ModelComponent,
    versionsRefs: Ref[],
    versions: string[],
    lane?: Lane,
    removeOnlyHead?: boolean
  ) {
    logger.debug(`removeComponentVersion, component ${component.id()}, versions ${versions.join(', ')}`);
    const objectRepo = this.objects();
    const componentHadHead = component.hasHead();
    const laneItem = lane?.getComponent(component.toComponentId());

    let allVersionsObjects: Version[] | undefined;

    const getNewHead = async () => {
      if (!removeOnlyHead) {
        const divergeData = component.getDivergeData();
        if (divergeData.commonSnapBeforeDiverge) {
          return divergeData.commonSnapBeforeDiverge;
        }
      }

      const head = component.head || laneItem?.head;
      if (!head) {
        return undefined;
      }
      allVersionsObjects =
        allVersionsObjects ||
        (await Promise.all(versions.map((localVer) => component.loadVersion(localVer, this.objects()))));

      const headVersion = allVersionsObjects.find((ver) => ver.hash().isEqual(head));
      return this.findHeadInExistingVersions(allVersionsObjects, component.id(), headVersion);
    };
    const refWasDeleted = (ref: Ref) => versionsRefs.find((removedRef) => ref.isEqual(removedRef));
    if (component.head && refWasDeleted(component.head)) {
      const newHead = await getNewHead();
      component.setHead(newHead);
    }
    if (laneItem && refWasDeleted(laneItem.head)) {
      const newHead = await getNewHead();
      if (newHead) {
        laneItem.head = newHead;
        const divergeData = component.getDivergeData();
        if (!component.laneHeadRemote && divergeData.commonSnapBeforeDiverge === newHead) {
          // if the component doesn't exist on the remote lane and this reset removed all local snaps, remove the
          // component from the lane. otherwise, the component stays on the lane but it's not staged so the export
          // fails on the remote saying the component doesn't exist (in case the remote-lane and component-lane are
          // not the same scope).
          lane?.removeComponent(component.toComponentId());
        }
      } else {
        if (lane?.isNew && this.scope.isExported(component.toComponentId()) && component.scope) {
          // the fact that the component has a scope-name means it was exported.
          throw new Error(`fatal: unable to find a new head for "${component.id()}".
this is because the lane ${lane.name} is new so the remote doesn't have previous snaps of this component.
also, this component wasn't part of a fork, so it's impossible to find a previous snap in the original-lane.
probably this component landed here as part of a merge from another lane.
it's impossible to leave the component in the .bitmap with a scope-name and without any version.
please either remove the component (bit remove) or remove the lane.`);
        }
        lane?.removeComponent(component.toComponentId());
      }
      component.laneHeadLocal = newHead;
      objectRepo.add(lane);
    }

    allVersionsObjects?.forEach((versionObj) => {
      const wasDeleted = refWasDeleted(versionObj.hash());
      if (!wasDeleted && versionObj.parents.some((parent) => refWasDeleted(parent))) {
        throw new Error(
          `fatal: version "${versionObj
            .hash()
            .toString()}" of "${component.id()}" has parents that got deleted, which makes the history invalid.`
        );
      }
    });
    versions.map((version) => {
      const ref = component.removeVersion(version);
      return ref;
    });
    if (componentHadHead && !component.hasHead() && component.versionArray.length) {
      throw new Error(`fatal: "head" prop was removed from "${component.id()}", although it has versions`);
    }

    if (component.versionArray.length || component.hasHead() || component.laneHeadLocal) {
      objectRepo.add(component); // add the modified component object
    } else {
      objectRepo.removeObject(component.hash());
    }
    objectRepo.unmergedComponents.removeComponent(component.toComponentId());
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
  async getRefsForComponentRemoval(bitId: ComponentID, includeVersions = true): Promise<Ref[]> {
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
      stopAt: existingHead ? [existingHead] : undefined,
    });
    const hashesOnly = allIncomingVersionsInfoUntilExistingHead
      .filter((v) => !v.tag) // only non-tag, the tagged are already part of the mergedVersion
      .map((v) => v.ref);
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
   * possible), or they both have diverged.
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
    isImport: boolean, // otherwise, it's coming from export
    versionObjects?: Version[], // for export, some versions don't exist locally yet.
    componentObjects?: ModelComponent[] // for export, some model-components don't exist locally yet.
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

    const sentVersionHashes = versionObjects?.map((v) => v.hash().toString());
    const versionParents = versionObjects?.map((v) => getVersionParentsFromVersion(v));

    if (existingLane && !existingLaneWithSameId) {
      // the lane id has changed
      existingLane.changeScope(lane.scope);
      existingLane.changeName(lane.name);
    }
    const mergeResults: MergeResult[] = [];
    const mergeErrors: ComponentNeedsUpdate[] = [];
    const isExport = !isImport;

    const getModelComponent = async (id: ComponentID): Promise<ModelComponent> => {
      const modelComponent =
        (await this.get(id)) || componentObjects?.find((c) => c.toComponentId().isEqualWithoutVersion(id));
      if (!modelComponent) {
        throw new Error(`unable to merge lane ${lane.name}, the component ${id.toString()} was not found`);
      }
      return modelComponent;
    };

    const mergeLaneComponent = async (component: LaneComponent) => {
      const modelComponent = await getModelComponent(component.id);
      const existingComponent = existingLane ? existingLane.components.find((c) => c.id.isEqual(component.id)) : null;
      if (!existingComponent) {
        if (isExport) {
          if (existingLane) {
            existingLane.addComponent(component);
            existingLane.removeComponentFromUpdateDependentsIfExist(component.id);
          }
          if (!sentVersionHashes?.includes(component.head.toString())) {
            // during export, the remote might got a lane when some components were not sent from the client. ignore them.
            return;
          }
          if (!versionParents) throw new Error('mergeLane, versionParents must be set during export');
          const subsetOfVersionParents = getSubsetOfVersionParents(versionParents, component.head);
          mergeResults.push({
            mergedComponent: modelComponent,
            mergedVersions: subsetOfVersionParents.map((h) => h.hash.toString()),
          });
          return;
        }
        const subsetOfVersionParents = versionParents
          ? getSubsetOfVersionParents(versionParents, component.head)
          : undefined;
        const allVersions = await getAllVersionHashes({
          modelComponent,
          repo,
          startFrom: component.head,
          versionParentsFromObjects: subsetOfVersionParents,
        });
        if (existingLane) existingLane.addComponent(component);
        mergeResults.push({ mergedComponent: modelComponent, mergedVersions: allVersions.map((h) => h.toString()) });
        return;
      }
      if (existingComponent.head.isEqual(component.head)) {
        mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
        return;
      }
      const subsetOfVersionParents = versionParents
        ? getSubsetOfVersionParents(versionParents, component.head)
        : undefined;
      const divergeResults = await getDivergeData({
        repo,
        modelComponent,
        targetHead: component.head,
        sourceHead: existingComponent.head,
        versionParentsFromObjects: subsetOfVersionParents,
      });
      if (divergeResults.isDiverged()) {
        if (isImport) {
          // do not update the local lane. later, suggest to snap-merge.
          mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
          return;
        }
        mergeErrors.push(new ComponentNeedsUpdate(component.id.toString(), existingComponent.head.toString()));
        return;
      }
      if (divergeResults.isTargetAhead()) {
        if (!existingLane) throw new Error(`mergeLane, existingLane must be set if target is ahead`);
        existingLane.addComponent(component);
        mergeResults.push({
          mergedComponent: modelComponent,
          mergedVersions: divergeResults.snapsOnTargetOnly.map((h) => h.toString()),
        });
        return;
      }
      // local is ahead, nothing to merge.
      mergeResults.push({ mergedComponent: modelComponent, mergedVersions: [] });
    };

    await pMap(
      lane.components,
      async (component) => {
        await mergeLaneComponent(component);
      },
      { concurrency: concurrentComponentsLimit() }
    );
    // downgrade the schema if the incoming lane has a lower schema because it's possible that components are deleted
    // in the incoming lane but because it has an old schema, it doesn't have the "isDeleted" prop. leaving the schema
    // of current lane as 1.0.0 will mistakenly think that the component is not deleted.
    if (existingLane?.hasChanged && existingLane.includeDeletedData() && !lane.includeDeletedData()) {
      existingLane.setSchemaToNotSupportDeletedData();
    }
    // merging updateDependents is tricky. the end user should never change it, only get it as is from the remote.
    // this prop gets updated with snap-from-scope with --update-dependents flag. and a graphql query should remove entries
    // from there. other than these 2 places, it should never change. so when a user imports it, always override.
    // if it is being exported, the remote should override it only when it comes from the snap-from-scope command, to
    // indicate this, the lane should have the overrideUpdateDependents prop set to true.
    if (isImport && existingLane) {
      existingLane.updateDependents = lane.updateDependents;
    }
    if (isExport && existingLane && lane.shouldOverrideUpdateDependents()) {
      await Promise.all(
        (lane.updateDependents || []).map(async (id) => {
          const existing = existingLane.updateDependents?.find((existingId) => existingId.isEqualWithoutVersion(id));
          if (!existing || existing.version !== id.version) {
            const mergedComponent = await getModelComponent(id);
            mergeResults.push({ mergedComponent, mergedVersions: [id.version] });
          }
        })
      );
      existingLane.updateDependents = lane.updateDependents;
    }

    return { mergeResults, mergeErrors, mergeLane: existingLane || lane };
  }
}
