export {
  Component as ConsumerComponent,
  ManuallyChangedDependencies,
  InvalidComponent,
  getDocsFromFiles,
} from './consumer-component';
export { Dependencies, Dependency } from './dependencies';
export { ImportSpecifier, Specifier, RelativePath } from './dependencies/dependency';
export { DEPENDENCIES_TYPES_UI_MAP, DEPENDENCIES_TYPES } from './dependencies/dependencies';
export { SchemaName, CURRENT_SCHEMA, isSchemaSupport, SchemaFeature } from './component-schema';
export { ComponentLoadOptions, DependencyLoaderOpts, LoadManyResult } from './component-load-options';
export { ComponentOutOfSync } from './exceptions/component-out-of-sync';
export { ComponentsPendingImport } from './exceptions/components-pending-import';
// thrown by bit-map; re-exported here for existing importers
export { ComponentNotFoundInPath, IgnoredDirectory } from '@teambit/legacy.bit-map';
