/** @flow */
import { Repository, BitObject } from '../objects';
import Scope from '../scope';
import Component from '../models/component';
import Version from '../models/version';
import Source from '../models/source';
import type { ComponentProps } from '../models/component';

export default class SourceRepository {
  scope: Scope;  

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objectsRepository;
  }

  findComponent(component: Component): Promise<Component> {
    return this.objects()
      .findOne(component.hash())
      .catch(() => null);
  }

  findOrAddComponent(props: ComponentProps): Promise<Component> {
    const comp = Component.from(props);
    return this.findComponent(comp)
      .then((component) => {
        if (!component) return comp;
        return component;
      });
  }

  addSource(source: any): Promise<Component> {
    const objectRepo = this.objects();
    return this.findOrAddComponent(source)
      .then((component) => {
        const impl = Source.from(Buffer.from(source.impl.src));
        const specs = source.specs ? Source.from(Buffer.from(source.specs.src)): null;
        const version = Version.fromComponent(source, impl, specs);
        component.addVersion(version);
        
        objectRepo
          .add(version)
          .add(component)
          .add(impl)
          .add(specs);
        
        return component;
      });
  }
}
