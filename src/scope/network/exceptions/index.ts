import ProtocolNotSupported from './protocol-not-supported';
import FsScopeNotLoaded from './fs-scope-not-loaded';
import RemoteScopeNotFound from './remote-scope-not-found';
import SSHConnectionError from './ssh-connection-error';
import PermissionDenied from './permission-denied';
import NetworkError from './network-error';
import UnexpectedNetworkError from './unexpected-network-error';
import SSHInvalidResponse from './ssh-invalid-response';
import AuthenticationFailed from './authentication-failed';
import OldClientVersion from './old-client-version';

export {
  AuthenticationFailed,
  ProtocolNotSupported,
  NetworkError,
  UnexpectedNetworkError,
  PermissionDenied,
  FsScopeNotLoaded,
  RemoteScopeNotFound,
  SSHConnectionError,
  SSHInvalidResponse,
  OldClientVersion,
};
