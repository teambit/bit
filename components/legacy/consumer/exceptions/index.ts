import ConsumerNotFound from './consumer-not-found';
import NewerVersionFound from './newer-version-found';

export { ConsumerNotFound, NewerVersionFound };
// thrown while loading a component; re-exported here for existing importers
export { ComponentOutOfSync, ComponentsPendingImport } from '@teambit/legacy.consumer-component';

export { ComponentsPendingMerge } from './components-pending-merge';
// thrown by the scope as well; re-exported here for existing importers
export { UnexpectedPackageName } from '@teambit/legacy.scope';
