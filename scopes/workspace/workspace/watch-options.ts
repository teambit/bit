import type { ComponentID } from '@teambit/component-id';

// the watch options live here and not in the watcher aspect, because the workspace passes them to
// the onComponentChange/onComponentAdd hooks, and the watcher aspect depends on the workspace.

export enum CheckTypes {
  None, // keep this. it equals zero. this way we can do "if checkTypes() ... "
  EntireProject,
  ChangedFile,
}

export type WatchOptions = {
  initiator?: any; // the real type is CompilationInitiator, however it creates a circular dependency with the compiler aspect.
  verbose?: boolean; // print watch events to the console. (also ts-server events if spawnTSServer is true)
  spawnTSServer?: boolean; // needed for check types and extract API/docs.
  checkTypes?: CheckTypes; // if enabled, the spawnTSServer becomes true.
  preCompile?: boolean; // whether compile all components before start watching
  compile?: boolean; // whether compile modified/added components during watch process
  import?: boolean; // whether import objects during watch when .bitmap got version changes
  preImport?: boolean; // whether import objects before starting the watch process in case .bitmap is more updated than local scope.
  generateTypes?: boolean; // whether generate d.ts files for typescript files during watch process (hurts performance)
  trigger?: ComponentID; // trigger onComponentChange for the specified component-id. helpful when this comp must be a bundle, and needs to be recompile on any dep change.
};
