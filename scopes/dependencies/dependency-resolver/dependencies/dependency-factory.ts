import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import { VariantPolicy } from '..';
import { Dependency, SerializedDependency } from './dependency';
import { DependencyList } from './dependency-list';

// export interface DependencyFactory<T extends Dependency, U extends SerializedDependency> {
//   parse(serializedDependency: U): T;
// }

// export interface DependencyFactory {
//   parse<T extends Dependency, U extends SerializedDependency>(serializedDependency: U): T;
// }

export interface DependencyFactory {
  type: string;
  parse: <T extends Dependency, U extends SerializedDependency>(serializedDependency: U) => Promise<T>;
  fromLegacyComponentAndPolicy?: (legacyComponent: LegacyComponent, policy: VariantPolicy) => Promise<DependencyList>;
}
