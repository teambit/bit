import InvalidRemote from './invalid-remote';
import PrimaryOverloaded from './primary-overloaded';
import RemoteNotFound from './remote-not-found';
// moved to legacy/scope, which handles it while fetching; re-exported here for existing importers
import { ScopeNotFoundOrDenied } from '@teambit/legacy.scope';

export { PrimaryOverloaded, InvalidRemote, RemoteNotFound, ScopeNotFoundOrDenied };
