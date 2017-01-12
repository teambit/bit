/** @flow */
import { Repository, BitObject } from '../objects';
import ComponentDependencies from '../models/object-component-dependencies';
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import { allSettled } from '../../utils';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import flattenDependencies from '../flatten-dependencies';
import Component from '../models/component';
import Version from '../models/version';
import Source from '../models/source';
import { BitId, BitIds } from '../../bit-id';
import type { ComponentProps } from '../models/component';
import type { ResultObject } from '../../utils/promise-to-result-object';

export type ComponentTree = {
  component: Component;
  objects: BitObject[];
};

export default class SourceRepository {
  scope: Scope;  

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objects;
  }

  findComponent(component: Component): Promise<Component> {
    return this.objects()
      .findOne(component.hash())
      .catch(() => null);
  }


  getComponent(bitId: BitId) {
    return this.get(bitId).then((component) => {
      if (!component) throw new ComponentNotFound();
      return component.loadVersion(
        bitId.getVersion().resolve(component.listVersions()), 
        this.objects()
      )
      .then(version => new ComponentDependencies({
        component,
        version,
        objects: 
      }));
    });
  }
  

  get(bitId: BitId): Promise<Component> {
    return this.findComponent(Component.fromBitId(bitId));
  }

  getMany(ids: BitIds): Promise<ResultObject[]> {
    return allSettled(ids.map(id => this.get(id)));
  }

  getObjects(id: BitId): Promise<ComponentObjects> {
    return this.get(id).then(component => component.collectObjects(this.objects()));
  }

  findOrAddComponent(props: ComponentProps): Promise<Component> {
    const comp = Component.from(props);
    return this.findComponent(comp)
      .then((component) => {
        if (!component) return comp;
        return component;
      });
  }

  addSource(source: any, dependencies: ComponentTree[]): Promise<Component> {
    const objectRepo = this.objects();
    return this.findOrAddComponent(source)
      .then((component) => {
        const impl = Source.from(Buffer.from(source.impl.src));
        const specs = source.specs ? Source.from(Buffer.from(source.specs.src)): null;
        const version = Version.fromComponent(source, impl, specs, flattenDependencies(dependencies));
        component.addVersion(version);
        
        objectRepo
          .add(version)
          .add(component)
          .add(impl)
          .add(specs);
        
        return component;
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

  merge({ component, objects }: ComponentTree): Promise<Component> {
    return this.findComponent(component).then((existingComponent) => {
      if (!existingComponent || component.compare(existingComponent)) {
        return this.put({ component, objects });
      }
      
      throw new MergeConflict();
    });
  }
}
