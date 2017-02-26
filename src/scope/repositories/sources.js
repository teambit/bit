/** @flow */
import { BitObject } from '../objects';
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY } from '../../constants';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import Component from '../models/component';
import ComponentVersion from '../component-version';
import Version from '../models/version';
import Source from '../models/source';
import { BitId } from '../../bit-id';
import type { ComponentProps } from '../models/component';
import ConsumerComponent from '../../consumer/component/consumer-component';
import * as globalConfig from '../../api/consumer/lib/global-config';
import loader from '../../cli/loader';
import { BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import Consumer from '../../consumer';

export type ComponentTree = {
  component: Component;
  objects: BitObject[];
};

export type ComponentDef = {
  id: BitId;
  component: Component;
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
        return null;
      });
  }

  getMany(ids: BitId[]): Promise<ComponentDef[]> {
    return Promise.all(ids.map((id) => {
      return this.get(id).then((component) => {
        return {
          id,
          component
        };
      });
    }));
  }
  
  get(bitId: BitId): Promise<?Component> {
    const component = Component.fromBitId(bitId);
    return this.findComponent(component);
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

  updateDist({ source }: { source: ConsumerComponent }): Promise<any> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source)
      .then((component) => {
        return component.loadVersion(component.latest(), objectRepo)
        .then((version) => {
          const dist = source.dist ? Source.from(Buffer.from(source.dist.src)): null;
          version.setDist(dist);
          objectRepo.add(dist)
          .add(version);
          return objectRepo.persist();
        });
      });
  }

  addSource({ source, depIds, message, force, consumer }: { 
    source: ConsumerComponent,
    depIds: BitId[],
    message: string,
    force: ?bool,
    consumer: Consumer
  }): Promise<Component> {
    const objectRepo = this.objects();

    return this.findOrAddComponent(source)
      .then((component) => {
        return source.build({ scope: this.scope, consumer })
        .then(() => {
          const impl = Source.from(Buffer.from(source.impl.src));
          const dist = source.dist ? Source.from(Buffer.from(source.dist.src)): null;
          const specs = source.specs ? Source.from(Buffer.from(source.specs.src)): null;

          const username = globalConfig.getSync(CFG_USER_NAME_KEY);
          const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);

          loader.start(BEFORE_RUNNING_SPECS);
          return source.runSpecs({ scope: this.scope, rejectOnFailure: !force, consumer })
          .then((specsResults) => {
            const version = Version.fromComponent({
              component: source,
              impl,
              specs,
              dist,
              flattenedDeps: depIds,
              specsResults,
              message,
              username,
              email,
            });
            
            component.addVersion(version);
            
            objectRepo
              .add(version)
              .add(component)
              .add(impl)
              .add(specs)
              .add(dist);
            
            return component;
          });
        });
      });
  }

  put({ component, objects }: ComponentTree) {
    const repo = this.objects();
    repo.add(component);
    objects.forEach(obj => repo.add(obj));
    return component;
  }

  clean(bitId: BitId) {
    return this.get(bitId)
      .then(component => component.remove(this.objects()));
  }



  merge({ component, objects }: ComponentTree, inScope: boolean = false): Promise<Component> {
    if (inScope) component.scope = this.scope.name;
    return this.findComponent(component).then((existingComponent) => {
      if (!existingComponent || component.compatibleWith(existingComponent)) {
        return this.put({ component, objects });
      }
      
      throw new MergeConflict();
    });
  }
}
