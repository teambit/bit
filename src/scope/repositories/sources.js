import { BitObject } from '../objects';
/** @flow */
import ComponentObjects from '../component-objects';
import Scope from '../scope';
import { MergeConflict, ComponentNotFound } from '../exceptions';
import Component from '../models/component';
import ComponentVersion from '../component-version';
import Version from '../models/version';
import Source from '../models/source';
import { BitId } from '../../bit-id';
import type { ComponentProps } from '../models/component';
import consumerComponent from '../../consumer/component/consumer-component';

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
      .catch(() => {
        return null;
      });
  }

  getComponent(bitId: BitId): Promise<ComponentVersion> {
    return this.get(bitId).then((component) => {
      if (!component) throw new ComponentNotFound();
      const versionNum = bitId.getVersion().resolve(component.listVersions());
      return component.loadVersion(versionNum, this.objects())
        .then(() => new ComponentVersion(
          component,
          versionNum,
          this.scope.name()
        ));
    });
  }
  
  get(bitId: BitId): Promise<Component> {
    const component = Component.fromBitId(bitId);
    return this.findComponent(component);
  }

  getObjects(id: BitId): Promise<ComponentObjects> {
    return this.get(id).then((component) => {
      if (!component) throw new ComponentNotFound();
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

  addSource(source: consumerComponent, dependencies: ComponentVersion[], message: string): Promise<Component> {
    const flattenedDeps = dependencies.map(dep => dep.id);
    const objectRepo = this.objects();
    return this.findOrAddComponent(source)
      .then((component) => {
        const impl = Source.from(Buffer.from(source.impl.src));
        const dist = source.build(this.scope) ? Source.from(Buffer.from(source.dist)): null;
        const specs = source.specs ? Source.from(Buffer.from(source.specs.src)): null;
        const version = Version.fromComponent({
          component: source, impl, specs, dist, flattenedDeps, message
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
    if (inScope) component.scope = this.scope.name();
    return this.findComponent(component).then((existingComponent) => {
      if (!existingComponent || component.compatibleWith(existingComponent)) {
        return this.put({ component, objects });
      }
      
      throw new MergeConflict();
    });
  }
}
