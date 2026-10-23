import type { Component, InvalidComponent } from './consumer-component';

export type ComponentLoadOptions = {
  loadDocs?: boolean;
  loadCompositions?: boolean;
  originatedFromHarmony?: boolean;
  loadExtensions?: boolean;
  storeInCache?: boolean;
  storeDepsInFsCache?: boolean;
  resolveExtensionsVersions?: boolean;
};
export type LoadManyResult = {
  components: Component[];
  invalidComponents: InvalidComponent[];
  removedComponents: Component[];
};

export type DependencyLoaderOpts = {
  cacheResolvedDependencies: Record<string, any>;
  cacheProjectAst?: Record<string, any>;
  useDependenciesCache: boolean;
  storeInFsCache?: boolean;
  resolveExtensionsVersions?: boolean;
};
