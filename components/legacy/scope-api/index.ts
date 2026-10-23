import remove from './lib/delete';
import * as scopeConfig from './lib/scope-config';
import initScope from './lib/scope-init';
import latestVersions from './lib/latest-versions';

export { ExternalActions, action } from './lib/action';
export { PushOptions, put } from './lib/put';
// thrown by the scope as well; re-exported here for existing importers
export { LaneNotFound } from '@teambit/legacy.scope';
export { CURRENT_FETCH_SCHEMA, FETCH_OPTIONS, fetch } from './lib/fetch';
export { initScope, scopeConfig, remove, latestVersions };
