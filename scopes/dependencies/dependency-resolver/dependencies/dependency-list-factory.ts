import { DependencyFactory } from './dependency-factory';
import { SerializedDependency } from './dependency';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { DependencyList } from './dependency-list';
import { UnknownDepType } from './exceptions';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  async fromSerializedDependencies(serializedDependencies: SerializedDependency[]): Promise<DependencyList> {
    const dependenciesP = serializedDependencies.map(async (serializedDependency) => {
      const type = serializedDependency.__type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = await factory.parse(serializedDependency);
      return dependency;
    });
    const dependencies = await Promise.all(dependenciesP);
    return new DependencyList(dependencies);
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const listsP = Object.values(this.factories).map(async (factory) => {
      if (factory.fromLegacyComponent && typeof factory.fromLegacyComponent === 'function') {
        return factory.fromLegacyComponent(legacyComponent);
      }
      return new DependencyList([]);
    });
    const lists = await Promise.all(listsP);
    return DependencyList.merge(lists);
  }
}
