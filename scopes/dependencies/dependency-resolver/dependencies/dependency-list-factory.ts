import Bluebird from 'bluebird';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { DependencyFactory } from './dependency-factory';
import { SerializedDependency } from './dependency';
import { DependencyList } from './dependency-list';
import { UnknownDepType } from './exceptions';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  async fromSerializedDependencies(serializedDependencies: SerializedDependency[]): Promise<DependencyList> {
    const dependencies = await Bluebird.mapSeries(serializedDependencies, async (serializedDependency) => {
      const type = serializedDependency.__type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = await factory.parse(serializedDependency);
      return dependency;
    });
    return new DependencyList(dependencies);
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const lists = await Bluebird.mapSeries(Object.values(this.factories), async (factory) => {
      if (factory.fromLegacyComponent && typeof factory.fromLegacyComponent === 'function') {
        return factory.fromLegacyComponent(legacyComponent);
      }
      return new DependencyList([]);
    });
    return DependencyList.merge(lists);
  }
}
