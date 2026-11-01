import FsScopeNotLoaded from './fs-scope-not-loaded';
import NetworkError from './network-error';
import OldClientVersion from './old-client-version';
import PermissionDenied from './permission-denied';
import ProtocolNotSupported from './protocol-not-supported';
import RemoteScopeNotFound from './remote-scope-not-found';
// moved to legacy/scope, which retries on it while fetching; re-exported here for existing importers
import { UnexpectedNetworkError } from '@teambit/legacy.scope';

export {
  ProtocolNotSupported,
  NetworkError,
  UnexpectedNetworkError,
  PermissionDenied,
  FsScopeNotLoaded,
  RemoteScopeNotFound,
  OldClientVersion,
};
