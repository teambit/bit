/**
 * a dependency of a component, as the dependency-resolver resolves it (its `Dependency`).
 * defined here so the component aspect doesn't depend on the dependency-resolver aspect.
 */
export type ComponentDependencyEntry = {
  id: string;
  version: string;
  type: string;
  lifecycle: string;
  source?: string;
  hidden?: boolean;
  optional?: boolean;
  getPackageName?: () => string;
};

export type ComponentDependenciesManifest = {
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional: true }>;
};

/**
 * the dependencies of a component, as the dependency-resolver resolves them (its `DependencyList`).
 * defined here so the component aspect doesn't depend on the dependency-resolver aspect.
 */
export interface ComponentDependencyList {
  readonly dependencies: ComponentDependencyEntry[];
  forEach(predicate: (dep: ComponentDependencyEntry, index?: number) => void): void;
  map(predicate: (dep: ComponentDependencyEntry, index?: number) => any): any[];
  toDependenciesManifest(): ComponentDependenciesManifest;
}
