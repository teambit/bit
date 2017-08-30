/** @flow */
import { bufferFrom, pathNormalizeToLinux } from '../../utils';
import { BitObject } from '../objects';
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY } from '../../constants';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import { Component, Version, Source, Symlink } from '../models';
import { BitId } from '../../bit-id';
import type { ComponentProps } from '../models/component';
import ConsumerComponent from '../../consumer/component';
import * as globalConfig from '../../api/consumer/lib/global-config';
import loader from '../../cli/loader';
import { BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import { Consumer } from '../../consumer';
import logger from '../../logger/logger';

export type ComponentTree = {
  component: Component;
  objects: BitObject[];
};

export type ComponentDef = {
  id: BitId;
  component: ?Component;
};

export default class SourceRepository {
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objects;
  }

  findComponent(component: Component): Promise<?Component> {
    return this.objects()
      .findOne(component.hash())
      .catch(() => {
        logger.debug(`failed finding a component with hash: ${component.hash()}`);
        return null;
      });
  }

  getMany(ids: BitId[]): Promise<ComponentDef[]> {
    logger.debug(`sources.getMany, Ids: ${ids.join(', ')}`);
    return Promise.all(
      ids.map((id) => {
        return this.get(id)
        .then((component) => {
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
    const foundComponent = await this.findComponent(component);
    if (foundComponent instanceof Symlink) {
      const realComponentId = BitId.parse(foundComponent.getRealComponentId());
      return this.findComponent(Component.fromBitId(realComponentId));
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
    return this.findComponent(comp)
      .then((component) => {
        if (!component) return comp;
        return component;
      });
  }

  modifyCIProps({ source, ciProps }:
  { source: ConsumerComponent, ciProps: Object }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source)
      .then((component) => {
        return component.loadVersion(component.latest(), objectRepo)
        .then((version) => {
          version.setCIProps(ciProps);
          return objectRepo.persistOne(version);
        });
      });
  }

  modifySpecsResults({ source, specsResults }:
  { source: ConsumerComponent, specsResults?: any }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source)
      .then((component) => {
        return component.loadVersion(component.latest(), objectRepo)
        .then((version) => {
          version.setSpecsResults(specsResults);
          return objectRepo.persistOne(version);
        });
      });
  }

  // TODO: This should treat dist as an array
  updateDist({ source }: { source: ConsumerComponent }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source)
      .then((component) => {
        return component.loadVersion(component.latest(), objectRepo)
        .then((version) => {
          const dist = source.dist ? Source.from(bufferFrom(source.dist.toString())): null;
          version.setDist(dist);
          objectRepo.add(dist)
          .add(version);
          return objectRepo.persist();
        });
      });
  }

  async consumerComponentToVersion({ consumerComponent, consumer, message, depIds, force, verbose }
  : { consumerComponent: ConsumerComponent,
      consumer: Consumer,
      message?: string,
      depIds?: Object,
      force?: boolean,
      verbose?: boolean }
  )
  : Promise<Object> {
    await consumerComponent.build({ scope: this.scope, consumer });
    const dists = consumerComponent.dists && consumerComponent.dists.length ? consumerComponent.dists.map((dist) => {
      return { name: dist.basename, relativePath: pathNormalizeToLinux(dist.relative), file: Source.from(dist.contents), test: dist.test };
    }) : null;
    const files = consumerComponent.files && consumerComponent.files.length ? consumerComponent.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), file: Source.from(file.contents), test: file.test };
    }) : null;

    const username = globalConfig.getSync(CFG_USER_NAME_KEY);
    const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);

    loader.start(BEFORE_RUNNING_SPECS);
    const specsResults = await consumerComponent
      .runSpecs({ scope: this.scope, rejectOnFailure: !force, consumer, verbose });

    consumerComponent.mainFile = pathNormalizeToLinux(consumerComponent.mainFile);
    const version = Version.fromComponent({
      component: consumerComponent,
      files,
      dists,
      flattenedDeps: depIds,
      specsResults,
      message,
      username,
      email,
    });

    return { version, dists, files };
  }

  async addSource({ source, depIds, message, force, consumer, verbose }: {
    source: ConsumerComponent,
    depIds: BitId[],
    message: string,
    force: ?bool,
    consumer: Consumer,
    verbose?: bool,
  }): Promise<Component> {
    const objectRepo = this.objects();

    // if a component exists in the model, add a new version. Otherwise, create a new component on them model
    const component = await this.findOrAddComponent(source);
    const { version, dists, files } = await this
      .consumerComponentToVersion({ consumerComponent: source, consumer, message, depIds, force, verbose });
    component.addVersion(version);

    objectRepo
      .add(version)
      .add(component)

    if (files) files.forEach(file => objectRepo.add(file.file));
    if (dists) dists.forEach(dist => objectRepo.add(dist.file));

    return component;
  }

  putAdditionalVersion(component, version, message) {
    version.log = {
      message,
      username: globalConfig.getSync(CFG_USER_NAME_KEY),
      email: globalConfig.getSync(CFG_USER_EMAIL_KEY),
      date: Date.now().toString()
    };
    component.addVersion(version);
    return this.put({ component, objects: [version] });
  }

  put({ component, objects }: ComponentTree) {
    logger.debug(`sources.put, id: ${component.id()}`);
    const repo = this.objects();
    repo.add(component);
    objects.forEach(obj => repo.add(obj));
    return component;
  }

  clean(bitId: BitId): Promise<void> {
    return this.get(bitId)
      .then((component) => {
        if (!component) return;
        component.remove(this.objects());
      });
  }

  /**
   * Adds the objects into scope.object array, in-memory. It doesn't save anything to the file-system.
   */
  merge({ component, objects }: ComponentTree, inScope: boolean = false): Promise<Component> {
    if (inScope) component.scope = this.scope.name;
    return this.findComponent(component).then((existingComponent) => {
      if (!existingComponent || component.compatibleWith(existingComponent)) {
        return this.put({ component, objects });
      }

      throw new MergeConflict(component.id());
    });
  }
}
