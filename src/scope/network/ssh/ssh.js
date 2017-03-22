/** @flow */
import R from 'ramda';
import keyGetter from './key-getter';
import ComponentObjects from '../../component-objects';
import { RemoteScopeNotFound, NetworkError, UnexpectedNetworkError, PermissionDenied } from '../exceptions';
import { BitIds, BitId } from '../../../bit-id';
import { toBase64, fromBase64 } from '../../../utils';
import ComponentNotFound from '../../../scope/exceptions/component-not-found';
import type { SSHUrl } from '../../../utils/parse-ssh-url';
import type { ScopeDescriptor } from '../../scope';
import { unpack } from '../../../cli/cli-utils';
import ConsumerComponent from '../../../consumer/component';

const rejectNils = R.reject(R.isNil);
const Client = require('ssh2').Client;
const conn = new Client();
const sequest = require('sequest');

function absolutePath(path: string) {
  if (!path.startsWith('/')) return `~/${path}`;
  return path;
}

function clean(str: string) {
  return str.replace('\n', '');
}

function errorHandler(err, optionalId) {
  switch (err.code) {
    default:
      return new UnexpectedNetworkError();
    case 127:
      return new ComponentNotFound(err.id || optionalId);
    case 128:
      return new PermissionDenied();
    case 129:
      return new RemoteScopeNotFound();
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

  buildCmd(commandName: string, ...args: string[]): string {
    function serialize() {
      return args
        .map(val => toBase64(val))
        .join(' ');
    }

    return `bit ${commandName} ${serialize()}`;
  }

  exec(commandName: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      let res, data;
      let cmd = this.buildCmd(commandName, absolutePath(this.path || ''), ...args);
      if (commandName === '_put') [cmd, data] = R.split(cmd.lastIndexOf(' '),cmd);
      this.connection.exec(cmd, (err, stream) => {
        if (commandName === '_put') stream.stdin.write(data);
        stream
          .on('close', code => {
            code !== 0 ? reject(errorHandler({ code }, res)) : resolve(res);
            this.connection.end();
          })
          .on('data', response => res = clean(response.toString()))
          .stderr.on('data', response => res = response.toString());
      });
    });
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.exec(componentObjects.toString())
      .then((str: string) => {
        try {
          return ComponentObjects.fromString(fromBase64(str));
        } catch (err) {
          throw new NetworkError(str);
        }
      });
  }

  describeScope(): Promise<ScopeDescriptor> {
    return this.exec('_scope')
      .then((data) => {
        return JSON.parse(fromBase64(data));
      })
      .catch(() => {
        throw new RemoteScopeNotFound();
      });
  }

  list() {
    return this.exec('_list')
    .then((str: string) => {
      const components = unpack(str);
      return rejectNils(components.map((c) => {
        return c ? ConsumerComponent.fromString(c) : null;
      }));
    });
  }

  search(query: string, reindex: boolean) {
    return this.exec('_search', query, reindex.toString()).then(JSON.parse);
  }

  show(id: BitId) {
    return this.exec('_show', id.toString())
    .then((str: string) => {
      const component = unpack(str);
      return str ? ConsumerComponent.fromString(component) : null;
    });
  }

  fetch(ids: BitIds, noDeps: bool = false): Promise<ComponentObjects[]> {
    let options = '';
    ids = ids.map(bitId => bitId.toString());
    if (noDeps) options = '-n';
    return this.exec(`_fetch ${options}`, ...ids)
      .then((str: string) => {
        const components = unpack(str);
        return components.map((raw) => {
          return ComponentObjects.fromString(raw);
        });
      });
  }

  close() {
    this.connection.end();
    return this;
  }

  composeConnectionUrl() {
    return `${this.username}@${this.host}:${this.port}`;
  }
  
  composeConnectionObject(key: ?string) {
    return { username: this.username, host: this.host, port: this.port, privateKey: keyGetter(key) };
  }

  connect(sshUrl: SSHUrl, key: ?string): Promise<SSH> {
    return new Promise((resolve, reject) => {
      try {
        conn.on('ready',() => {
          this.connection = conn;
          resolve(this);
        }).connect(this.composeConnectionObject(key));
      } catch (e) { return reject(e); }
    });
  }
}
