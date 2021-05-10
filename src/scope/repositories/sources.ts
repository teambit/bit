import R from 'ramda';
import pMap from 'p-map';
import { isHash } from '@teambit/component-version';
import { BitId, BitIds } from '../../bit-id';
import { BuildStatus, COMPONENT_ORIGINS, Extensions } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import { revertDirManipulationForPath } from '../../consumer/component-ops/manipulate-dir';
import AbstractVinyl from '../../consumer/component/sources/abstract-vinyl';
import { ArtifactFiles, ArtifactSource, getArtifactsFiles } from '../../consumer/component/sources/artifact-files';
import Consumer from '../../consumer/consumer';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import { PathLinux, PathOsBased } from '../../utils/path';
import ComponentObjects from '../component-objects';
import { getAllVersionHashes, getAllVersionsInfo, VersionInfo } from '../component-ops/traverse-versions';
import { ComponentNotFound } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import UnmergedComponents from '../lanes/unmerged-components';
import { ModelComponent, Source, Symlink, Version } from '../models';
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

const MAX_AGE_UN_BUILT_COMPS_CACHE = 60 * 1000;

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
    logger.debug(`sources.getMany, Ids: ${ids.join(', ')}`);
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
    const version = await this.objects().load(versionHash);
    if (!version) {
      logger.debugAndAddBreadCrumb('sources.get', `${msg} object was not found on the filesystem`);
      return undefined;
    }

    return returnComponent(version as Version);
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
    } catch (err) {
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

  modifyCIProps({ source, ciProps }: { source: ConsumerComponent; ciProps: Record<string, any> }): Promise<any> {
    const objectRepo = this.objects();

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        version.setCIProps(ciProps);
        return objectRepo._writeOne(version);
      });
    });
  }

  modifySpecsResults({ source, specsResults }: { source: ConsumerComponent; specsResults?: any }): Promise<any> {
    const objectRepo = this.objects();

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        version.setSpecsResults(specsResults);
        return objectRepo._writeOne(version);
      });
    });
  }

  // TODO: This should treat dist as an array
  updateDist({ source }: { source: ConsumerComponent }): Promise<any> {
    const objectRepo = this.objects();

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const dist = source.dist ? Source.from(Buffer.from(source.dist.toString())) : undefined;
        version.setDist(dist);
        objectRepo.add(dist).add(version);
        return objectRepo.persist();
      });
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
  async consumerComponentToVersion({
    consumerComponent,
    consumer,
  }: {
    readonly consumerComponent: ConsumerComponent;
    consumer: Consumer;
  }): Promise<{ version: Version; files: any; dists: any; compilerFiles: any; testerFiles: any }> {
    const clonedComponent: ConsumerComponent = consumerComponent.clone();
    const setEol = (files: AbstractVinyl[]) => {
      if (!files) return null;
      const result = files.map((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        file.file = file.toSourceAsLinuxEOL();
        return file;
      });
      return result;
    };
    const manipulateDirs = (pathStr: PathOsBased): PathLinux => {
      return revertDirManipulationForPath(pathStr, clonedComponent.originallySharedDir, clonedComponent.wrapDir);
    };

    const files = consumerComponent.files.map((file) => {
      return {
        name: file.basename,
        relativePath: manipulateDirs(file.relative),
        file: file.toSourceAsLinuxEOL(),
        test: file.test,
      };
    });
    // @todo: is this the best way to find out whether a compiler is set?
    const isCompileSet = Boolean(
      consumerComponent.compiler ||
        clonedComponent.extensions.some(
          (e) => e.name === Extensions.compiler || e.name === 'bit.core/compile' || e.name === Extensions.envs
        )
    );
    const { dists, mainDistFile } = clonedComponent.dists.toDistFilesModel(
      consumer,
      consumerComponent.originallySharedDir,
      isCompileSet
    );

    const compilerFiles = setEol(R.path(['compiler', 'files'], consumerComponent));
    const testerFiles = setEol(R.path(['tester', 'files'], consumerComponent));

    clonedComponent.mainFile = manipulateDirs(clonedComponent.mainFile);
    clonedComponent.getAllDependencies().forEach((dependency) => {
      // ignoreVersion because when persisting the tag is higher than currently exist in .bitmap
      const depFromBitMap = consumer.bitMap.getComponentIfExist(dependency.id, { ignoreVersion: true });
      dependency.relativePaths.forEach((relativePath) => {
        if (!relativePath.isCustomResolveUsed) {
          // for isCustomResolveUsed it was never stripped
          relativePath.sourceRelativePath = manipulateDirs(relativePath.sourceRelativePath);
        }
        if (depFromBitMap && depFromBitMap.origin !== COMPONENT_ORIGINS.AUTHORED) {
          // when a dependency is not authored, we need to also change the
          // destinationRelativePath, which is the path written in the link file, however, the
          // dir manipulation should be according to this dependency component, not the
          // consumerComponent passed to this function
          relativePath.destinationRelativePath = revertDirManipulationForPath(
            relativePath.destinationRelativePath,
            depFromBitMap.originallySharedDir,
            depFromBitMap.wrapDir
          );
        }
      });
    });
    clonedComponent.overrides.addOriginallySharedDir(clonedComponent.originallySharedDir);
    const version: Version = Version.fromComponent({
      component: clonedComponent,
      files: files as any,
      dists,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      mainDistFile,
    });
    // $FlowFixMe it's ok to override the pendingVersion attribute
    consumerComponent.pendingVersion = version as any; // helps to validate the version against the consumer-component

    return { version, files, dists, compilerFiles, testerFiles };
  }

  async consumerComponentToVersionHarmony(
    consumerComponent: ConsumerComponent
  ): Promise<{ version: Version; files: any }> {
    const clonedComponent: ConsumerComponent = consumerComponent.clone();
    const files = consumerComponent.files.map((file) => {
      return {
        name: file.basename,
        relativePath: file.relative,
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
    resolveUnmerged = false,
  }: {
    source: ConsumerComponent;
    consumer: Consumer;
    lane: Lane | null;
    resolveUnmerged?: boolean;
  }): Promise<ModelComponent> {
    const objectRepo = this.objects();
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const component = await this.findOrAddComponent(source);
    const unmergedComponent = consumer.scope.objects.unmergedComponents.getEntry(component.name);
    if (unmergedComponent && !unmergedComponent.resolved && !resolveUnmerged) {
      throw new GeneralError(
        `unable to snap/tag "${component.name}", it is unmerged with conflicts. please run "bit merge <id> --resolve"`
      );
    }
    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { version, files, dists, compilerFiles, testerFiles } = await this.consumerComponentToVersion({
      consumerComponent: source,
      consumer,
    });
    objectRepo.add(version);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, lane, objectRepo);

    if (unmergedComponent) {
      version.addParent(unmergedComponent.head);
      version.log.message = version.log.message
        ? version.log.message
        : UnmergedComponents.buildSnapMessage(unmergedComponent);
      consumer.scope.objects.unmergedComponents.removeComponent(component.name);
    }
    objectRepo.add(component);

    files.forEach((file) => objectRepo.add(file.file));
    if (dists) dists.forEach((dist) => objectRepo.add(dist.file));
    if (compilerFiles) compilerFiles.forEach((file) => objectRepo.add(file.file));
    if (testerFiles) testerFiles.forEach((file) => objectRepo.add(file.file));
    if (artifacts) artifacts.forEach((file) => objectRepo.add(file.source));

    return component;
  }

  async addSourceFromScope(source: ConsumerComponent): Promise<ModelComponent> {
    const objectRepo = this.objects();
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    const component = await this.findOrAddComponent(source);
    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    const { version, files } = await this.consumerComponentToVersionHarmony(source);
    objectRepo.add(version);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, null, objectRepo);
    objectRepo.add(component);
    files.forEach((file) => objectRepo.add(file.file));
    if (artifacts) artifacts.forEach((file) => objectRepo.add(file.source));
    return component;
  }

  putModelComponent(component: ModelComponent) {
    const repo: Repository = this.objects();
    repo.add(component);
  }

  put({ component, objects }: ComponentTree): ModelComponent {
    logger.debug(`sources.put, id: ${component.id()}, versions: ${component.listVersions().join(', ')}`);
    const repo: Repository = this.objects();
    repo.add(component);

    // const isObjectShouldBeAdded = (obj) => {
    //   // don't add a component if it's already exist locally with more versions
    //   if (obj instanceof ModelComponent) {
    //     const loaded = repo.loadSync(obj.hash(), false);
    //     if (loaded) {
    //       // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    //       if (Object.keys(loaded.versions) > Object.keys(obj.versions)) {
    //         return false;
    //       }
    //     }
    //   }
    //   return true;
    // };

    objects.forEach((obj) => {
      // @todo: do we need this?
      // if (isObjectShouldBeAdded(obj)) repo.add(obj);
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
  removeComponentVersions(component: ModelComponent, versions: string[], allVersionsObjects: Version[]): void {
    logger.debug(`removeComponentVersion, component ${component.id()}, versions ${versions.join(', ')}`);
    const objectRepo = this.objects();
    versions.forEach((version) => {
      const ref = component.removeVersion(version);
      const refStr = ref.toString();
      const versionObject = allVersionsObjects.find((v) => v.hash().isEqual(ref));
      if (!versionObject) throw new Error(`removeComponentVersions failed finding a version object of ${refStr}`);
      // update the snap head if needed
      if (component.getHeadStr() === refStr) {
        if (versionObject.parents.length > 1)
          throw new Error(
            `removeComponentVersions found multiple parents for a local (un-exported) version ${version} of ${component.id()}`
          );
        const head = versionObject.parents.length === 1 ? versionObject.parents[0] : undefined;
        component.setHead(head);
      }
      // update other versions parents if they point to the deleted version
      allVersionsObjects.forEach((obj) => {
        if (obj.hasParent(ref)) {
          obj.removeParent(ref);
          objectRepo.add(obj);
        }
      });

      objectRepo.removeObject(ref);
    });

    if (component.versionArray.length || component.hasHead()) {
      objectRepo.add(component); // add the modified component object
    } else {
      // @todo: make sure not to delete the component when it has snaps but not versions!
      // if all versions were deleted, delete also the component itself from the model
      objectRepo.removeObject(component.hash());
    }
    objectRepo.unmergedComponents.removeComponent(component.name);
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
   * Adds the objects into scope.object array, in-memory. It doesn't save anything to the file-system.
   *
   * If the 'isImport' is true and the existing component wasn't changed locally, it doesn't check for
   * discrepancies, but simply override the existing component.
   * In this context, "discrepancy" means, same version but different hashes.
   * When using import command, it makes sense to override a component in case of discrepancies because the source of
   * truth should be the remote scope from where the import fetches the component.
   * When the same component has different versions in the remote and the local, it merges the two
   * by calling this.mergeTwoComponentsObjects().
   *
   * when dealing with lanes, exporting/importing lane's components, this function doesn't do much
   * if any. that's because the head is not saved on the ModelComponent but on the lane object.
   * to rephrase with other words,
   * this function merges an incoming modelComponent with an existing modelComponent, so if all
   * changes where done on a lane, this function will not do anything because modelComponent
   * hasn't changed.
   */
  async merge(
    incomingComp: ModelComponent,
    versionObjects: Version[]
  ): Promise<{ mergedComponent: ModelComponent; mergedVersions: string[] }> {
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
      this.putModelComponent(incomingComp);
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
    if (existingComponentHead) {
      const mergedSnaps = await this.getMergedSnaps(existingComponentHead, incomingComp, versionObjects);
      mergedVersions.push(...mergedSnaps);
    }

    this.putModelComponent(mergedComponent);
    return { mergedComponent, mergedVersions };
  }

  private async getMergedSnaps(
    existingHead: Ref,
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
   */
  async mergeLane(
    lane: Lane,
    local: boolean
  ): Promise<Array<{ mergedComponent: ModelComponent; mergedVersions: string[] } | ComponentNeedsUpdate>> {
    const repo = this.objects();
    const existingLane = await this.scope.loadLane(lane.toLaneId());
    if (!existingLane) {
      repo.add(lane);
    }
    const mergeResults = await Promise.all(
      lane.components.map(async (component) => {
        const modelComponent = await this.get(component.id);
        if (!modelComponent) {
          throw new Error(`unable to merge lane ${lane.name}, the component ${component.id.toString()} was not found`);
        }
        const existingComponent = existingLane ? existingLane.components.find((c) => c.id.isEqual(component.id)) : null;
        if (!existingComponent) {
          modelComponent.laneHeadLocal = component.head;
          const allVersions = await getAllVersionHashes(modelComponent, repo);
          if (existingLane) existingLane.addComponent(component);
          return { mergedComponent: modelComponent, mergedVersions: allVersions.map((h) => h.toString()) };
        }
        if (existingComponent.head.isEqual(component.head)) {
          return { mergedComponent: modelComponent, mergedVersions: [] };
        }
        modelComponent.laneHeadRemote = component.head;
        modelComponent.laneHeadLocal = existingComponent.head;
        await modelComponent.setDivergeData(repo);
        const divergeResults = modelComponent.getDivergeData();
        if (divergeResults.isDiverged()) {
          if (local) {
            // do not update the local lane. later, suggest to snap-merge.
            return { mergedComponent: modelComponent, mergedVersions: [] };
          }
          return new ComponentNeedsUpdate(component.id.toString(), existingComponent.head.toString());
        }
        if (divergeResults.isRemoteAhead()) {
          existingComponent.head = component.head;
          return {
            mergedComponent: modelComponent,
            mergedVersions: divergeResults.snapsOnRemoteOnly.map((h) => h.toString()),
          };
        }
        // local is ahead, nothing to merge.
        return { mergedComponent: modelComponent, mergedVersions: [] };
      })
    );
    repo.add(existingLane);
    // objects.forEach((obj) => repo.add(obj));
    return mergeResults;
  }
}
