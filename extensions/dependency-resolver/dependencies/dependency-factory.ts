import { Dependency, SerializedDependency } from './dependency';

export interface DependencyFactory {
  parse: (serializedDependency: SerializedDependency) => Dependency;
}
