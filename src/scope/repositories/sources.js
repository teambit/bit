/** @flow */
import R from 'ramda';
import { bufferFrom, eol } from '../../utils';
import { BitObject } from '../objects';
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY, DEFAULT_BIT_RELEASE_TYPE, COMPONENT_ORIGINS } from '../../constants';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import { ModelComponent, Version, Source, Symlink } from '../models';
import { BitId, BitIds } from '../../bit-id';
import type { ComponentProps } from '../models/model-component';
import ConsumerComponent from '../../consumer/component';
import * as globalConfig from '../../api/consumer/lib/global-config';
import logger from '../../logger/logger';
import Repository from '../objects/repository';
import AbstractVinyl from '../../consumer/component/sources/abstract-vinyl';
import Consumer from '../../consumer/consumer';
import { PathOsBased, PathLinux } from '../../utils/path';

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

  async findComponent(component: ModelComponent): Promise<?ModelComponent> {
    try {
      const foundComponent = await this.objects().findOne(component.hash());
      if (foundComponent) return foundComponent;
    } catch (err) {
      logger.error(`findComponent got an error ${err}`);
    }
    logger.debug(`failed finding a component ${component.id()} with hash: ${component.hash().toString()}`);
    return null;
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
    let foundComponent = await this.findComponent(component);
    if (foundComponent instanceof Symlink) {
      const realComponentId: BitId = foundComponent.getRealComponentId();
      foundComponent = await this.findComponent(ModelComponent.fromBitId(realComponentId));
    }

    if (foundComponent && bitId.hasVersion()) {
      const msg = `found ${bitId.toStringWithoutVersion()}, however version ${bitId.getVersion().versionNum}`;
      if (!foundComponent.versions[bitId.version]) {
        logger.debug(`${msg} is not in the component versions array`);
        return null;
      }
      const version = await this.objects().findOne(foundComponent.versions[bitId.version]);
      if (!version) {
        logger.debug(`${msg} object was not found on the filesystem`);
        return null;
      }
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
    return this.findComponent(comp).then((component) => {
      if (!component) return comp;
      return component;
    });
  }

  modifyCIProps({ source, ciProps }: { source: ConsumerComponent, ciProps: Object }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        version.setCIProps(ciProps);
        return objectRepo.persistOne(version);
      });
    });
  }

  modifySpecsResults({ source, specsResults }: { source: ConsumerComponent, specsResults?: any }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source).then((component) => {
      return component.loadVersion(component.latest(), objectRepo).then((version) => {
        version.setSpecsResults(specsResults);
        return objectRepo.persistOne(version);
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
   * among other things, it adds the originallySharedDir for the files, dists and dependencies.
   *
   * warning: Do not change anything on the consumerComponent instance! Only use its clone.
   *
   * @see consumer-components.stripOriginallySharedDir() where the sharedDir was stripped.
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
      const withSharedDir: PathLinux = clonedComponent.addSharedDir(pathStr);
      return clonedComponent.removeWrapperDir(withSharedDir);
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

    const username = globalConfig.getSync(CFG_USER_NAME_KEY);
    const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);

    clonedComponent.mainFile = manipulateDirs(clonedComponent.mainFile);
    clonedComponent.getAllDependencies().forEach((dependency) => {
      const depFromBitMap = consumer.bitMap.getComponentIfExist(dependency.id);
      dependency.relativePaths.forEach((relativePath) => {
        if (!relativePath.isCustomResolveUsed) {
          // for isCustomResolveUsed it was never stripped
          relativePath.sourceRelativePath = manipulateDirs(relativePath.sourceRelativePath);
          if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.IMPORTED) {
            relativePath.destinationRelativePath = manipulateDirs(relativePath.destinationRelativePath);
          }
        }
      });
    });
    const version = Version.fromComponent({
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

  putAdditionalVersion(
    component: ModelComponent,
    version: Version,
    message,
    releaseType: string = DEFAULT_BIT_RELEASE_TYPE
  ): ModelComponent {
    version.log = {
      message,
      username: globalConfig.getSync(CFG_USER_NAME_KEY),
      email: globalConfig.getSync(CFG_USER_EMAIL_KEY),
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
   * removeVersion - remove specific component version from component
   * @param {ModelComponent} component - component to remove version from
   * @param {string} version - version to remove.
   * @param persist
   */
  async removeVersion(component: ModelComponent, version: string, persist: boolean = true): Promise<void> {
    logger.debug(`removing version ${version} of ${component.id()} from a local scope`);
    const objectRepo = this.objects();
    const modifiedComponent = await component.removeVersion(objectRepo, version);
    objectRepo.add(modifiedComponent);
    if (persist) await objectRepo.persist();
    return modifiedComponent;
  }

  /**
   * clean - remove component or component version
   * @param {BitId} bitId - id to remove
   * @param {boolean} deepRemove - remove all component refs or only version refs
   */
  async clean(bitId: BitId, deepRemove: boolean = false): Promise<void> {
    logger.debug(`sources.clean: ${bitId}, deepRemove: ${deepRemove.toString()}`);
    const component = await this.get(bitId);
    if (!component) return;
    await component.remove(this.objects(), deepRemove);
  }

  /**
   * merge the existing component with the data from the incoming component
   * here, we assume that there is no conflict between the two, otherwise, this.merge() would throw
   * a MergeConflict exception.
   */
  mergeTwoComponentsObjects(existingComponent: ModelComponent, incomingComponent: ModelComponent): ModelComponent {
    // the base component to save is the existingComponent because it might contain local data that
    // is not available in the remote component, such as the "state" property.
    const mergedComponent = existingComponent;
    // in case the existing version has is different than incoming version hash, use the incoming
    // version because we hold the incoming component from a remote as the source of truth
    Object.keys(existingComponent.versions).forEach((existingVersion) => {
      if (incomingComponent.versions[existingVersion]) {
        mergedComponent.versions[existingVersion] = incomingComponent.versions[existingVersion];
      }
    });
    // in case the incoming component has versions that are not in the existing component, copy them
    Object.keys(incomingComponent.versions).forEach((incomingVersion) => {
      if (!existingComponent.versions[incomingVersion]) {
        mergedComponent.versions[incomingVersion] = incomingComponent.versions[incomingVersion];
      }
    });
    return mergedComponent;
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
  ): Promise<ModelComponent> {
    if (inScope) component.scope = this.scope.name;
    const existingComponent: ?ModelComponent = await this.findComponent(component);
    if (!existingComponent) return this.put({ component, objects });
    const locallyChanged = await existingComponent.isLocallyChanged();
    if ((local && !locallyChanged) || component.compatibleWith(existingComponent, local)) {
      logger.debug(`sources.merge component ${component.id()}`);
      const mergedComponent = this.mergeTwoComponentsObjects(existingComponent, component);
      return this.put({ component: mergedComponent, objects });
    }

    const conflictVersions = component.diffWith(existingComponent, local);
    throw new MergeConflict(component.id(), conflictVersions);
  }
}
