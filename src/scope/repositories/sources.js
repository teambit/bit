/** @flow */
import R from 'ramda';
import path from 'path';
import { bufferFrom, pathNormalizeToLinux } from '../../utils';
import { BitObject } from '../objects';
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import {
  CFG_USER_NAME_KEY,
  CFG_USER_EMAIL_KEY,
  DEFAULT_BIT_RELEASE_TYPE,
  COMPONENT_ORIGINS,
  LATEST_BIT_VERSION
} from '../../constants';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import { Component, Version, Source, Symlink } from '../models';
import { BitId } from '../../bit-id';
import type { ComponentProps } from '../models/component';
import ConsumerComponent from '../../consumer/component';
import * as globalConfig from '../../api/consumer/lib/global-config';
import { Consumer } from '../../consumer';
import logger from '../../logger/logger';
import Repository from '../objects/repository';

export type ComponentTree = {
  component: Component,
  objects: BitObject[]
};

export type ComponentDef = {
  id: BitId,
  component: ?Component
};

export default class SourceRepository {
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objects;
  }

  async findComponent(component: Component): Promise<?Component> {
    try {
      const foundComponent = await this.objects().findOne(component.hash());
      if (foundComponent) return foundComponent;
    } catch (err) {
      logger.error(`findComponent got an error ${err}`);
    }
    logger.debug(`failed finding a component ${component.id()} with hash: ${component.hash()}`);
    return null;
  }

  getMany(ids: BitId[]): Promise<ComponentDef[]> {
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

  async get(bitId: BitId): Promise<?Component> {
    const component = Component.fromBitId(bitId);
    let foundComponent = await this.findComponent(component);
    if (foundComponent instanceof Symlink) {
      const realComponentId = BitId.parse(foundComponent.getRealComponentId());
      foundComponent = this.findComponent(Component.fromBitId(realComponentId));
    }

    // This is to take care of case when the component is exists in the scope, but the requested version is missing
    if (
      foundComponent &&
      !bitId.getVersion().latest &&
      !R.contains(bitId.getVersion().versionNum, foundComponent.listVersions())
    ) {
      logger.debug(
        `found ${bitId.toStringWithoutVersion()}, however version ${bitId.getVersion().versionNum} was not found`
      );
      return null;
    }
    return foundComponent;
  }

  getObjects(id: BitId): Promise<ComponentObjects> {
    return this.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.collectObjects(this.objects());
    });
  }

  findOrAddComponent(props: ComponentProps): Promise<Component> {
    const comp = Component.from(props);
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
   * Given a consumer-component object, returns the Version representation.
   * Useful for saving into the model or calculation the hash for comparing with other Version object.
   *
   * @param consumerComponent
   * @param consumer
   * @param message
   * @param flattenedDependencies
   * @param dists
   * @param specsResults
   * @return {Promise.<{version: Version, dists: *, files: *}>}
   */
  async consumerComponentToVersion({
    consumerComponent,
    message,
    flattenedDependencies,
    flattenedDevDependencies,
    dists,
    specsResults
  }: {
    consumerComponent: ConsumerComponent,
    consumer: Consumer,
    message?: string,
    flattenedDependencies?: Object,
    flattenedDevDependencies?: Object,
    force?: boolean,
    verbose?: boolean,
    forHashOnly?: boolean,
    dists?: Object,
    specsResults?: any
  }): Promise<Object> {
    const addSharedDir = (pathStr) => {
      const withSharedDir = consumerComponent.originallySharedDir
        ? path.join(consumerComponent.originallySharedDir, pathStr)
        : pathStr;
      return pathNormalizeToLinux(withSharedDir);
    };
    const files =
      consumerComponent.files && consumerComponent.files.length
        ? consumerComponent.files.map((file) => {
          return {
            name: file.basename,
            relativePath: pathNormalizeToLinux(addSharedDir(file.relative)),
            file: Source.from(file.contents),
            test: file.test
          };
        })
        : null;

    const username = globalConfig.getSync(CFG_USER_NAME_KEY);
    const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);

    consumerComponent.mainFile = pathNormalizeToLinux(addSharedDir(consumerComponent.mainFile));
    consumerComponent.getAllDependencies().forEach((dependency) => {
      dependency.relativePaths.forEach((relativePath) => {
        relativePath.sourceRelativePath = addSharedDir(relativePath.sourceRelativePath);
      });
    });
    const version = Version.fromComponent({
      component: consumerComponent,
      files,
      dists,
      flattenedDependencies,
      flattenedDevDependencies,
      specsResults,
      message,
      username,
      email
    });

    return { version, files };
  }

  async addSource({
    source,
    flattenedDependencies,
    flattenedDevDependencies,
    message,
    exactVersion,
    releaseType,
    dists,
    specsResults
  }: {
    source: ConsumerComponent,
    flattenedDependencies: BitId[],
    flattenedDevDependencies: BitId[],
    message: string,
    exactVersion: ?string,
    releaseType: string,
    dists?: Object,
    specsResults?: any
  }): Promise<Component> {
    const objectRepo = this.objects();

    // if a component exists in the model, add a new version. Otherwise, create a new component on them model
    const component = await this.findOrAddComponent(source);
    const { version, files } = await this.consumerComponentToVersion({
      consumerComponent: source,
      message,
      flattenedDependencies,
      flattenedDevDependencies,
      dists,
      specsResults
    });
    component.addVersion(version, releaseType, exactVersion);
    component.local = true;
    objectRepo.add(version).add(component);

    if (files) files.forEach(file => objectRepo.add(file.file));
    if (dists) dists.forEach(dist => objectRepo.add(dist.file));

    return component;
  }

  putAdditionalVersion(
    component: Component,
    version: Version,
    message,
    releaseType: string = DEFAULT_BIT_RELEASE_TYPE
  ): Component {
    version.log = {
      message,
      username: globalConfig.getSync(CFG_USER_NAME_KEY),
      email: globalConfig.getSync(CFG_USER_EMAIL_KEY),
      date: Date.now().toString()
    };
    component.addVersion(version, releaseType);
    component.local = true;
    return this.put({ component, objects: [version] });
  }

  put({ component, objects }: ComponentTree): Component {
    logger.debug(`sources.put, id: ${component.id()}`);
    const repo: Repository = this.objects();
    repo.add(component);

    const isObjectShouldBeAdded = (obj) => {
      // don't add a component if it's already exist locally with more versions
      if (obj instanceof Component) {
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
   * @param {Component} component - component to remove version from
   * @param {BitId} bitId - bitid with version to remove.
   */
  async removeVersion(component: Component, bitId: BitId): Promise<void> {
    const objectRepo = this.objects();
    const modifiedComponent = await component.removeVersion(objectRepo, bitId.version);
    objectRepo.add(modifiedComponent);
    await objectRepo.persist();
    return modifiedComponent;
  }

  /**
   * clean - remove component or component version
   * @param {BitId} bitId - bitid to remove
   * @param {boolean} deepRemove - remove all component refs or only version refs
   */
  clean(bitId: BitId, deepRemove: boolean = false): Promise<void> {
    return this.get(bitId).then((component) => {
      if (!component) return;
      return component.remove(this.objects(), deepRemove);
    });
  }

  /**
   * Adds the objects into scope.object array, in-memory. It doesn't save anything to the file-system.
   *
   * When this function get called originally from import command, the 'force' parameter is true. Otherwise, if it was
   * originated from export command, it'll be false.
   * If the 'force' is true and the existing component wasn't changed locally (existingComponent.local if false), it
   * doesn't check for discrepancies, but simply override the existing component.
   * When using import command, it makes sense to override a component in case of discrepancies because the source of
   * true should be the remote scope from where the import fetches the component.
   */
  merge({ component, objects }: ComponentTree, inScope: boolean = false, force: boolean = true): Promise<Component> {
    if (inScope) component.scope = this.scope.name;
    return this.findComponent(component).then((existingComponent: ?Component) => {
      if (!existingComponent || (force && !existingComponent.local) || component.compatibleWith(existingComponent)) {
        return this.put({ component, objects });
      }

      throw new MergeConflict(component.id());
    });
  }
}
