import ComponentOutOfSync from './component-out-of-sync';
import ConsumerNotFound from './consumer-not-found';
import NewerVersionFound from './newer-version-found';

export { ConsumerNotFound, NewerVersionFound, ComponentOutOfSync };

export { ComponentsPendingImport } from './components-pending-import';
export { ComponentsPendingMerge } from './components-pending-merge';
// thrown by the scope as well; re-exported here for existing importers
export { UnexpectedPackageName } from '@teambit/legacy.scope';
