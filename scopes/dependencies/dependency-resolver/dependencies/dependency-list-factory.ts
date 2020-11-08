import { DependencyFactory } from './dependency-factory';
import { SerializedDependency } from './dependency';
import { DependencyList } from './dependency-list';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { UnknownDepType } from './exceptions';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  fromSerializedDependencies(serializedDependencies: SerializedDependency[]): DependencyList {
    const dependencies = serializedDependencies.map((serializedDependency) => {
      const type = serializedDependency.__type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = factory.parse(serializedDependency);
      return dependency;
    });
    return new DependencyList(dependencies);
  }

  fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {
    const lists = Object.values(this.factories).map((factory) => {
      if (factory.fromLegacyComponent && typeof factory.fromLegacyComponent === 'function') {
        return factory.fromLegacyComponent(legacyComponent);
      }
      return new DependencyList([]);
    });
    return DependencyList.merge(lists);
  }
}
