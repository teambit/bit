import ProtocolNotSupported from './protocol-not-supported';
import FsScopeNotLoaded from './fs-scope-not-loaded';
import RemoteScopeNotFound from './remote-scope-not-found';
import SSHConnectionError from './ssh-connection-error';
import PermissionDenied from './permission-denied';
import NetworkError from './network-error';
import UnexpectedNetworkError from './unexpected-network-error';

export {
  ProtocolNotSupported,
  NetworkError,
  UnexpectedNetworkError,
  PermissionDenied,
  FsScopeNotLoaded,
  RemoteScopeNotFound,
  SSHConnectionError
};
