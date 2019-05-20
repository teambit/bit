/** @flow */
import R from 'ramda';
import { bufferFrom, eol } from '../../utils';
import { BitObject } from '../objects';
import ComponentObjects from '../component-objects';
import type Scope from '../scope';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY, DEFAULT_BIT_RELEASE_TYPE, COMPONENT_ORIGINS } from '../../constants';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import { ModelComponent, Version, Source, Symlink } from '../models';
import { BitId, BitIds } from '../../bit-id';
import type { ComponentProps } from '../models/model-component';
import type ConsumerComponent from '../../consumer/component';
import * as globalConfig from '../../api/consumer/lib/global-config';
import logger from '../../logger/logger';
import Repository from '../objects/repository';
import AbstractVinyl from '../../consumer/component/sources/abstract-vinyl';
import type Consumer from '../../consumer/consumer';
import type { PathOsBased, PathLinux } from '../../utils/path';
import { revertDirManipulationForPath } from '../../consumer/component-ops/manipulate-dir';

export type ComponentTree = {
  component: ModelComponent,
  objects: BitObject[]
};

export type ComponentDef = {
  id: BitId,
  component: ?ModelComponent
};

export default class SourceRepository {
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objects;
  }

  getMany(ids: BitId[] | BitIds): Promise<ComponentDef[]> {
    logger.debug(`sources.getMany, Ids: ${ids.join(', ')}`);
    return Promise.all(
      ids.map((id) => {
        return this.get(id).then((component) => {
          return {
            id,
            component
          };
        });
      })
    );
  }

  async get(bitId: BitId): Promise<?ModelComponent> {
    const component = ModelComponent.fromBitId(bitId);
    const foundComponent: ?ModelComponent = await this._findComponent(component);
    if (foundComponent && bitId.hasVersion()) {
      // $FlowFixMe
      const msg = `found ${bitId.toStringWithoutVersion()}, however version ${bitId.getVersion().versionNum}`;
      // $FlowFixMe
      if (!foundComponent.versions[bitId.version]) {
        logger.debugAndAddBreadCrumb('sources.get', `${msg} is not in the component versions array`);
        return null;
      }
      // $FlowFixMe
      const version = await this.objects().load(foundComponent.versions[bitId.version]);
      if (!version) {
        logger.debugAndAddBreadCrumb('sources.get', `${msg} object was not found on the filesystem`);
        return null;
      }
    }

    return foundComponent;
  }

  async _findComponent(component: ModelComponent): Promise<?ModelComponent> {
    try {
      const foundComponent = await this.objects().load(component.hash());
      if (foundComponent instanceof Symlink) {
        return this._findComponentBySymlink(foundComponent);
      }
      if (foundComponent) return foundComponent;
    } catch (err) {
      logger.error(`findComponent got an error ${err}`);
    }
    logger.debug(`failed finding a component ${component.id()} with hash: ${component.hash().toString()}`);
    return null;
  }

  async _findComponentBySymlink(symlink: Symlink): Promise<?ModelComponent> {
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

  modifyCIProps({ source, ciProps }: { source: ConsumerComponent, ciProps: Object }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        version.setCIProps(ciProps);
        return objectRepo._writeOne(version);
      });
    });
  }

  modifySpecsResults({ source, specsResults }: { source: ConsumerComponent, specsResults?: any }): Promise<any> {
    const objectRepo = this.objects();

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

    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        const dist = source.dist ? Source.from(bufferFrom(source.dist.toString())) : null;
        version.setDist(dist);
        objectRepo.add(dist).add(version);
        return objectRepo.persist();
      });
    });
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
    versionFromModel,
    message,
    flattenedDependencies,
    flattenedDevDependencies,
    flattenedCompilerDependencies,
    flattenedTesterDependencies,
    specsResults
  }: {
    consumerComponent: $ReadOnly<ConsumerComponent>,
    consumer: Consumer,
    versionFromModel?: Version,
    message?: string,
    flattenedDependencies?: Object,
    flattenedDevDependencies?: Object,
    flattenedCompilerDependencies?: Object,
    flattenedTesterDependencies?: Object,
    force?: boolean,
    verbose?: boolean,
    specsResults?: any
  }): Promise<Object> {
    // $FlowFixMe
    const clonedComponent: ConsumerComponent = consumerComponent.clone();
    const setEol = (files: AbstractVinyl[]) => {
      if (!files) return;
      const result = files.map((file) => {
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
        test: file.test
      };
    });
    const dists = clonedComponent.dists.toDistFilesModel(
      consumer,
      consumerComponent.originallySharedDir,
      consumerComponent.compiler
    );
    const compilerFiles = setEol(R.path(['compiler', 'files'], consumerComponent));
    const testerFiles = setEol(R.path(['tester', 'files'], consumerComponent));

    const [username, email] = await Promise.all([
      globalConfig.get(CFG_USER_NAME_KEY),
      globalConfig.get(CFG_USER_EMAIL_KEY)
    ]);

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
      versionFromModel,
      files,
      dists,
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      specsResults,
      message,
      username,
      email
    });
    // $FlowFixMe it's ok to override the pendingVersion attribute
    consumerComponent.pendingVersion = version; // helps to validate the version against the consumer-component

    return { version, files, dists, compilerFiles, testerFiles };
  }

  async addSource({
    source,
    consumer,
    flattenedDependencies,
    flattenedDevDependencies,
    flattenedCompilerDependencies,
    flattenedTesterDependencies,
    message,
    exactVersion,
    releaseType,
    specsResults
  }: {
    source: ConsumerComponent,
    consumer: Consumer,
    flattenedDependencies: BitIds,
    flattenedDevDependencies: BitIds,
    flattenedCompilerDependencies: BitIds,
    flattenedTesterDependencies: BitIds,
    message: string,
    exactVersion: ?string,
    releaseType: string,
    specsResults?: any
  }): Promise<ModelComponent> {
    const objectRepo = this.objects();

    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    const component = await this.findOrAddComponent(source);
    // TODO: instead of doing that like this we should use:
    // const versionFromModel = await component.loadVersion(source.usedVersion, this.scope.objects);
    // it looks like it's exactly the same code but it's not working from some reason
    const versionRef = component.versions[source.usedVersion];

    let versionFromModel;
    if (versionRef) {
      versionFromModel = await this.scope.getObject(versionRef.hash);
    }
    const { version, files, dists, compilerFiles, testerFiles } = await this.consumerComponentToVersion({
      consumerComponent: source,
      consumer,
      versionFromModel,
      message,
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      specsResults
    });
    component.addVersion(version, releaseType, exactVersion);
    objectRepo.add(version).add(component);

    files.forEach(file => objectRepo.add(file.file));
    if (dists) dists.forEach(dist => objectRepo.add(dist.file));
    if (compilerFiles) compilerFiles.forEach(file => objectRepo.add(file.file));
    if (testerFiles) testerFiles.forEach(file => objectRepo.add(file.file));

    return component;
  }

  async putAdditionalVersion(
    component: ModelComponent,
    version: Version,
    message: string,
    releaseType: string = DEFAULT_BIT_RELEASE_TYPE
  ): Promise<ModelComponent> {
    const [username, email] = await Promise.all([
      globalConfig.get(CFG_USER_NAME_KEY),
      globalConfig.get(CFG_USER_EMAIL_KEY)
    ]);
    version.log = {
      message,
      username,
      email,
      date: Date.now().toString()
    };
    component.addVersion(version, releaseType);
    return this.put({ component, objects: [version] });
  }

  put({ component, objects }: ComponentTree): ModelComponent {
    logger.debug(`sources.put, id: ${component.id()}, versions: ${component.listVersions().join(', ')}`);
    const repo: Repository = this.objects();
    repo.add(component);

    const isObjectShouldBeAdded = (obj) => {
      // don't add a component if it's already exist locally with more versions
      if (obj instanceof ModelComponent) {
        const loaded = repo.loadSync(obj.hash(), false);
        if (loaded) {
          if (Object.keys(loaded.versions) > Object.keys(obj.versions)) {
            return false;
          }
        }
      }
      return true;
    };

    objects.forEach((obj) => {
      if (isObjectShouldBeAdded(obj)) repo.add(obj);
    });
    return component;
  }

  /**
   * remove specified component versions from component.
   * if all versions of a component were deleted, delete also the component.
   * it doesn't persist anything to the filesystem.
   * (repository.persist() needs to be called at the end of the operation)
   */
  removeComponentVersions(component: ModelComponent, versions: string[]): void {
    logger.debug(`removeComponentVersion, component ${component.id()}, versions ${versions.join(', ')}`);
    const objectRepo = this.objects();
    versions.forEach((version) => {
      const ref = component.removeVersion(version);
      objectRepo.removeObject(ref);
    });

    if (component.versionArray.length) {
      objectRepo.add(component); // add the modified component object
    } else {
      // if all versions were deleted, delete also the component itself from the model
      objectRepo.removeObject(component.hash());
    }
  }

  /**
   * @see this.removeComponent()
   *
   */
  async removeComponentById(bitId: BitId): Promise<void> {
    logger.debug(`sources.removeComponentById: ${bitId.toString()}`);
    const component = await this.get(bitId);
    if (!component) return;
    this.removeComponent(component);
  }

  /**
   * remove all versions objects of the component from local scope.
   * if deepRemove is true, it removes also the refs associated with the removed versions.
   * finally, it removes the component object itself
   * it doesn't physically delete from the filesystem.
   * the actual delete is done at a later phase, once Repository.persist() is called.
   *
   * @param {ModelComponent} component
   * @param {boolean} [deepRemove=false] - whether remove all the refs or only the version array
   */
  removeComponent(component: ModelComponent): void {
    const repo = this.objects();
    logger.debug(`sources.removeComponent: removing a component ${component.id()} from a local scope`);
    const objectRefs = component.versionArray;
    objectRefs.push(component.hash());
    repo.removeManyObjects(objectRefs);
  }

  /**
   * merge the existing component with the data from the incoming component
   * here, we assume that there is no conflict between the two, otherwise, this.merge() would throw
   * a MergeConflict exception.
   */
  mergeTwoComponentsObjects(
    existingComponent: ModelComponent,
    incomingComponent: ModelComponent
  ): { mergedComponent: ModelComponent, mergedVersions: string[] } {
    // the base component to save is the existingComponent because it might contain local data that
    // is not available in the remote component, such as the "state" property.
    const mergedComponent = existingComponent;
    const mergedVersions: string[] = [];
    // in case the existing version hash is different than incoming version hash, use the incoming
    // version because we hold the incoming component from a remote as the source of truth
    Object.keys(existingComponent.versions).forEach((existingVersion) => {
      if (
        incomingComponent.versions[existingVersion] &&
        existingComponent.versions[existingVersion].toString() !==
          incomingComponent.versions[existingVersion].toString()
      ) {
        mergedComponent.versions[existingVersion] = incomingComponent.versions[existingVersion];
        mergedVersions.push(existingVersion);
      }
    });
    // in case the incoming component has versions that are not in the existing component, copy them
    Object.keys(incomingComponent.versions).forEach((incomingVersion) => {
      if (!existingComponent.versions[incomingVersion]) {
        mergedComponent.versions[incomingVersion] = incomingComponent.versions[incomingVersion];
        mergedVersions.push(incomingVersion);
      }
    });
    return { mergedComponent, mergedVersions };
  }

  /**
   * Adds the objects into scope.object array, in-memory. It doesn't save anything to the file-system.
   *
   * When this function gets called originally from import command, the 'local' parameter is true. Otherwise, if it was
   * originated from export command, it'll be false.
   * If the 'local' is true and the existing component wasn't changed locally, it doesn't check for
   * discrepancies, but simply override the existing component.
   * In this context, "discrepancy" means, same version but different hashes.
   * When using import command, it makes sense to override a component in case of discrepancies because the source of
   * truth should be the remote scope from where the import fetches the component.
   * When the same component has different versions in the remote and the local, it merges the two
   * by calling this.mergeTwoComponentsObjects().
   */
  async merge(
    { component, objects }: ComponentTree,
    inScope: boolean = false,
    local: boolean = true
  ): Promise<{ mergedComponent: ModelComponent, mergedVersions: string[] }> {
    if (inScope) component.scope = this.scope.name;
    const existingComponent: ?ModelComponent = await this._findComponent(component);
    if (!existingComponent) {
      this.put({ component, objects });
      return { mergedComponent: component, mergedVersions: component.listVersions() };
    }
    const locallyChanged = existingComponent.isLocallyChanged();
    if ((local && !locallyChanged) || component.compatibleWith(existingComponent, local)) {
      logger.debug(`sources.merge component ${component.id()}`);
      const { mergedComponent, mergedVersions } = this.mergeTwoComponentsObjects(existingComponent, component);
      this.put({ component: mergedComponent, objects });
      return { mergedComponent, mergedVersions };
    }

    const conflictVersions = component.diffWith(existingComponent, local);
    throw new MergeConflict(component.id(), conflictVersions);
  }
}
