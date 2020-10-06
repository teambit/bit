export type DependencyLifecycleType = 'runtime' | 'dev' | 'peer';

export interface SerializedDependency {
  id: string;
  version: string;
  type: string;
  lifecycle: string;
}

export interface Dependency {
  id: string;
  version: string;
  type: string;
  lifecycle: DependencyLifecycleType;

  serialize: () => SerializedDependency;
}
