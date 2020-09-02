import AuthenticationFailed from './authentication-failed';
import FsScopeNotLoaded from './fs-scope-not-loaded';
import NetworkError from './network-error';
import OldClientVersion from './old-client-version';
import PermissionDenied from './permission-denied';
import ProtocolNotSupported from './protocol-not-supported';
import RemoteScopeNotFound from './remote-scope-not-found';
import SSHConnectionError from './ssh-connection-error';
import SSHInvalidResponse from './ssh-invalid-response';
import UnexpectedNetworkError from './unexpected-network-error';

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
