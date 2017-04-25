/** @flow */
import R from 'ramda';
import keyGetter from './key-getter';
import ComponentObjects from '../../component-objects';
import { RemoteScopeNotFound, UnexpectedNetworkError, PermissionDenied } from '../exceptions';
import { BitIds, BitId } from '../../../bit-id';
import { toBase64, packCommand, buildCommandMessage, unpackCommand } from '../../../utils';
import ComponentNotFound from '../../../scope/exceptions/component-not-found';
import type { SSHUrl } from '../../../utils/parse-ssh-url';
import type { ScopeDescriptor } from '../../scope';
import ConsumerComponent from '../../../consumer/component';
import checkVersionCompatibility from '../check-version-compatibility'

const rejectNils = R.reject(R.isNil);
const Client = require('ssh2').Client;

const conn = new Client();

function absolutePath(path: string) {
  if (!path.startsWith('/')) return `~/${path}`;
  return path;
}

function clean(str: string) {
  return str.replace('\n', '');
}

function errorHandler(code, err) {
  let parsedError;
  try {
    parsedError = JSON.parse(err);
  } catch (e) {
    // be greacfull when can't parse error message
  }

  switch (code) {
    default:
      return new UnexpectedNetworkError();
    case 127:
      return new ComponentNotFound((parsedError && parsedError.id) || err);
    case 128:
      return new PermissionDenied();
    case 129:
      return new RemoteScopeNotFound((parsedError && parsedError.id) || err);
    case 130:
      return new PermissionDenied();
  }
}

export type SSHProps = {
  path: string,
  username: string,
  port: number,
  host: string
};

export default class SSH {
  connection: any;
  path: string;
  username: string;
  port: number;
  host: string;

  constructor({ path, username, port, host }: SSHProps) {
    this.path = path;
    this.username = username;
    this.port = port;
    this.host = host || '';
  }

  buildCmd(commandName: string, path: string, payload: any): string {
    return `bit ${commandName} ${toBase64(path)} ${packCommand(buildCommandMessage(payload))}`;
  }

  exec(commandName: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let res = '';
      let err = '';
      const cmd = this.buildCmd(
        commandName,
        absolutePath(this.path || ''),
        commandName === '_put' ? null : payload
      );

      this.connection.exec(cmd, (e, stream) => {
        if (commandName === '_put') {
          stream.stdin.write(toBase64(payload));
          stream.stdin.eof();
        }
        stream
          .on('data', chunk => res += chunk.toString())
          .on('close', (code) => (code && code !== 0
            ? reject(errorHandler(code, err))
            : resolve(clean(res))
          ))
          .stderr.on('data', chunk => err += chunk.toString());
      });
    });
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.exec('_put', componentObjects.toString())
      .then((data: string) => {
        const { payload, headers } = unpackCommand(data);
        checkVersionCompatibility(headers.version);
        return ComponentObjects.fromString(payload);
      });
  }

  describeScope(): Promise<ScopeDescriptor> {
    return this.exec('_scope')
      .then((data) => {
        const { payload, headers } = unpackCommand(data);
        checkVersionCompatibility(headers.version);
        return payload;
      })
      .catch((err) => {
        throw new RemoteScopeNotFound(err);
      });
  }

  list() {
    return this.exec('_list')
    .then((str: string) => {
      const { payload, headers } = unpackCommand(str);
      checkVersionCompatibility(headers.version);
      return rejectNils(payload.map((c) => {
        return c ? ConsumerComponent.fromString(c) : null;
      }));
    });
  }

  search(query: string, reindex: boolean) {
    return this.exec('_search', { query, reindex: reindex.toString() })
      .then((data) => {
        const { payload, headers } = unpackCommand(data);
        checkVersionCompatibility(headers.version);
        return payload;
      });
  }

  show(id: BitId) {
    return this.exec('_show', id.toString())
    .then((str: string) => {
      const { payload, headers } = unpackCommand(str);
      checkVersionCompatibility(headers.version);
      return str ? ConsumerComponent.fromString(payload) : null;
    });
  }

  fetch(ids: BitIds, noDeps: bool = false): Promise<ComponentObjects[]> {
    let options = '';
    ids = ids.map(bitId => bitId.toString());
    if (noDeps) options = '-n';
    return this.exec(`_fetch ${options}`, ids)
      .then((str: string) => {
        const { payload, headers } = unpackCommand(str);
        checkVersionCompatibility(headers.version);
        return payload.map((raw) => {
          return ComponentObjects.fromString(raw);
        });
      });
  }

  close() {
    this.connection.end();
    return this;
  }

  composeConnectionObject(key: ?string) {
    return {
      username: this.username,
      host: this.host,
      port: this.port,
      privateKey: keyGetter(key)
    };
  }

  connect(sshUrl: SSHUrl, key: ?string): Promise<SSH> {
    return new Promise((resolve, reject) => {
      try {
        conn.on('ready', () => {
          this.connection = conn;
          resolve(this);
        }).connect(this.composeConnectionObject(key));
      } catch (e) { return reject(e); }
    });
  }
}
