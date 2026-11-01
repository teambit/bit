import connect from './network-lib';

export { connect };
export {
  Http,
  ProxyConfig,
  NetworkConfig,
  ExportOrigin,
  fetchWithAgent,
  getAuthHeader,
  getFetcherWithAgent,
  DEFAULT_AUTH_TYPE,
  getAuthDataFromHeader,
} from './http/http';
export { Network } from './network';
export { remoteErrorHandler } from './remote-error-handler';
export { UnexpectedNetworkError } from './exceptions';
// owned by remote-actions (the auth data passed to an action); re-exported here for existing importers
export type { AuthData } from '@teambit/scope.remote-actions';
