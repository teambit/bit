import { Dependency, SerializedDependency } from './dependency';

// export interface DependencyFactory<T extends Dependency, U extends SerializedDependency> {
//   parse(serializedDependency: U): T;
// }

// export interface DependencyFactory {
//   parse<T extends Dependency, U extends SerializedDependency>(serializedDependency: U): T;
// }

export interface DependencyFactory {
  parse: <T extends Dependency, U extends SerializedDependency>(serializedDependency: U) => T;
}
