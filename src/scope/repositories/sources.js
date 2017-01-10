/** @flow */
import { Repository, BitObject } from '../objects';
import Scope from '../scope';
import Component from '../models/component';
import Version from '../models/version';
import Source from '../models/source';
import type { ComponentProps } from '../models/component';
import type { VersionProps } from '../models/version';

export default class SourceRepository {
  scope: Scope;  

  constructor(scope: Scope) {
    this.scope = scope;
  }

  objects() {
    return this.scope.objectsRepository;
  }

  buildComponent(source: ComponentProps) {
    return new Component({ name: source.name, box: source.box });
  }

  findComponent(component: Component): Promise<Component> {
    return this.objects()
      .findOne(component.hash())
      .catch(() => null);
  }

  buildVersion(versionProps: any, version: number) {
    return new Version({
      impl: {
        file: Source.from('').hash(),
        name: versionProps.implFile
      },
      specs: {
        file: Source.from('').hash(),
        name: versionProps.specsFile
      },
      version,
      compiler: Component.fromBitId().hash(),
      tester: Component.fromBitId().hash(),
      packageDependencies: versionProps.packageDependencies,
      dependencies: []
    });
  }

  findOrAddComponent(props: ComponentProps): Promise<Component> {
    const comp = this.buildComponent(props);
    return this.findComponent(comp)
      .then((component) => {
        if (!component) {
          this.objects().add(comp);
          return comp;
        }

        return component;
      });
  }

  addSource(source: any): Promise<any> {
    return this.findOrAddComponent(source)
      .then((component) => {
        const version = this.buildVersion(source, component.version());
        component.addVersion(version);
        const objectRepo = this.objects();
        objectRepo
          .add(version)
          .add(component);
      });
  }
}
