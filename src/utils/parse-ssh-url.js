/** @flow */
import isNumber from './is-number';

export type SSHUrl = {
  username: string,
  port: number,
  host: string,
  path: ?string
};

/**
 * @credit taken from mikeal/sequest and modified
 * to include path and protocol prefix parsing.
 */
export default function parseSSHUrl(str: string): SSHUrl {
  let user = 'root';
  let port = 22;
  let path = null;
  if (str.startsWith('ssh://')) str = str.replace('ssh://', '');
  if (str.startsWith('bit://')) str = str.replace('ssh://', '');

  if (str.indexOf('@') !== -1) {
    user = str.slice(0, str.indexOf('@'));
    str = str.slice(str.indexOf('@') + 1);
  }
  if (str.indexOf(':') !== -1) {
    const [potentialPort, potentialPath] = str
      .slice(str.indexOf(':') + 1)
      .split(':');

    const maybePort = parseInt(potentialPort);
    if (!isNaN(maybePort) && isNumber(maybePort)) {
      port = maybePort;
      if (potentialPath) path = potentialPath;
    }

    if (!potentialPath && isNaN(maybePort)) {
      path = potentialPort;
    }

    str = str.slice(0, str.indexOf(':'));
  }
  const host = str;

  return {
    host,
    path,
    port,
    username: user
  };
}
