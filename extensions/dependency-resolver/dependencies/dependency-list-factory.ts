import { DependencyFactory } from './dependency-factory';
import { SerializedDependency } from './dependency';
import { DependencyList } from './dependency-list';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { UnknownDepType } from './exceptions';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  fromSerializedDependencies(serializedDependencies: SerializedDependency[]): DependencyList {
    const dependencies = serializedDependencies.map((serializedDependency) => {
      const type = serializedDependency.type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = factory.parse(serializedDependency);
      return dependency;
    });
    return new DependencyList(dependencies);
  }

  static fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {}
}
