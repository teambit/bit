/** @flow */
import R from 'ramda';
import keyGetter from './key-getter';
import ComponentObjects from '../../component-objects';
import { RemoteScopeNotFound, UnexpectedNetworkError, PermissionDenied, SSHInvalidResponse } from '../exceptions';
import MergeConflict from '../../exceptions/merge-conflict';
import { BitIds, BitId } from '../../../bit-id';
import { toBase64, packCommand, buildCommandMessage, unpackCommand } from '../../../utils';
import ComponentNotFound from '../../../scope/exceptions/component-not-found';
import type { SSHUrl } from '../../../utils/parse-ssh-url';
import type { ScopeDescriptor } from '../../scope';
import ConsumerComponent from '../../../consumer/component';
import checkVersionCompatibilityFunction from '../check-version-compatibility';
import logger from '../../../logger/logger';
import type { Network } from '../network';

const checkVersionCompatibility = R.once(checkVersionCompatibilityFunction);
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
    logger.error(`ssh: failed parsing error as JSON, error: ${err}`);
  }

  switch (code) {
    default:
      return new UnexpectedNetworkError(parsedError ? parsedError.message : err);
    case 127:
      return new ComponentNotFound((parsedError && parsedError.id) || err);
    case 128:
      return new PermissionDenied();
    case 129:
      return new RemoteScopeNotFound((parsedError && parsedError.id) || err);
    case 130:
      return new PermissionDenied();
    case 131:
      return new MergeConflict((parsedError && parsedError.id) || err);
  }
}

export type SSHProps = {
  path: string,
  username: string,
  port: number,
  host: string
};

export default class SSH implements Network {
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
    logger.debug(`ssh: going to run a remote command ${commandName}, path: ${this.path}`);
    return new Promise((resolve, reject) => {
      let res = '';
      let err;
      const cmd = this.buildCmd(
        commandName,
        absolutePath(this.path || ''),
        commandName === '_put' ? null : payload
      );
      this.connection.exec(cmd, (error, stream) => {
        if (error) {
          logger.error('ssh, exec returns an error: ', error);
          return reject(error);
        }
        if (commandName === '_put') {
          stream.stdin.write(toBase64(payload));
          stream.stdin.end();
        }
        stream
          .on('data', (response) => {
            res += response.toString();
          })
          .on('exit', (code) => {
            logger.error(`ssh: server had been exiting before closing. Exit code: ${code}`);
            return code && code !== 0 ?
              reject(errorHandler(code, err)) :
              resolve(clean(res));
          })
          .on('close', (code, signal) => {
            if (commandName === '_put') res = res.replace(payload, '');
            logger.debug(`ssh: returned with code: ${code}, signal: ${signal}.`);
            // DO NOT CLOSE THE CONNECTION (using this.connection.end()), it causes bugs when there are several open
            // connections. Same bugs occur when running "this.connection.end()" on "end" event. There is no point to
            // run it on 'exit' event, it never reach there.
            return code && code !== 0 ?
              reject(errorHandler(code, err)) :
              resolve(clean(res));
          })
          .stderr.on('data', (response) => {
            err = response.toString();
            logger.error(`ssh: got an error, ${err}`);
          });
      });
    });
  }

  _unpack(data) {
    try {
      return unpackCommand(data);
    } catch (err) {
      logger.error(`unpackCommand found on error "${err}", while paring the following string: ${data}`);
      throw new SSHInvalidResponse(data);
    }
  }

  pushMany(manyComponentObjects: ComponentObjects[]): Promise<ComponentObjects[]> {
    return this.exec('_put', ComponentObjects.manyToString(manyComponentObjects))
      .then((data: string) => {
        const { payload, headers } = this._unpack(data);
        checkVersionCompatibility(headers.version);
        return ComponentObjects.manyFromString(payload);
      });
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.pushMany([componentObjects]);
  }

  describeScope(): Promise<ScopeDescriptor> {
    return this.exec('_scope')
      .then((data) => {
        const { payload, headers } = this._unpack(data);
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
        const { payload, headers } = this._unpack(str);
        checkVersionCompatibility(headers.version);
        return rejectNils(payload.map((c) => {
          return c ? ConsumerComponent.fromString(c) : null;
        }));
      });
  }

  search(query: string, reindex: boolean) {
    return this.exec('_search', { query, reindex: reindex.toString() })
      .then((data) => {
        const { payload, headers } = this._unpack(data);
        checkVersionCompatibility(headers.version);
        return payload;
      });
  }

  show(id: BitId) {
    return this.exec('_show', id.toString())
      .then((str: string) => {
        const { payload, headers } = this._unpack(str);
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
        const { payload, headers } = this._unpack(str);
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
    const sshConfig = this.composeConnectionObject(key)
    return new Promise((resolve, reject) => {
      if (!sshConfig.privateKey) reject('Could not authenticate\nPlease make sure you have configured ssh access and permissions to the remote scope');
      try {
        conn
          .on('error', err => reject(err))
          .on('ready', () => {
            this.connection = conn;
            resolve(this);
          }).connect(sshConfig);
      } catch (e) { return reject(e); }
    });
  }
}
