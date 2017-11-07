/** @flow */
import SSH2 from 'ssh2';
import R from 'ramda';
import merge from 'lodash.merge';
import { passphrase as promptPassphrase } from '../../../prompts';
import keyGetter from './key-getter';
import ComponentObjects from '../../component-objects';
import { RemoteScopeNotFound, UnexpectedNetworkError, PermissionDenied, SSHInvalidResponse } from '../exceptions';
import MergeConflict from '../../exceptions/merge-conflict';
import { BitIds, BitId } from '../../../bit-id';
import { toBase64, packCommand, buildCommandMessage, unpackCommand } from '../../../utils';
import ComponentNotFound from '../../../scope/exceptions/component-not-found';
import type { ScopeDescriptor } from '../../scope';
import ConsumerComponent from '../../../consumer/component';
import checkVersionCompatibilityFunction from '../check-version-compatibility';
import logger from '../../../logger/logger';
import type { Network } from '../network';
import { DEFAULT_SSH_READY_TIMEOUT } from '../../../constants';

const checkVersionCompatibility = R.once(checkVersionCompatibilityFunction);
const rejectNils = R.reject(R.isNil);
const PASSPHRASE_MESSAGE = 'Encrypted private key detected, but no passphrase given';
let cachedPassphrase = null;

function absolutePath(path: string) {
  if (!path.startsWith('/')) return `~/${path}`;
  return path;
}

function clean(str: string) {
  return str.replace('\n', '');
}

export type SSHProps = {
  path: string,
  username: string,
  port: number,
  host: string
};

export default class SSH implements Network {
  connection: ?SSH2;
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
      const cmd = this.buildCmd(commandName, absolutePath(this.path || ''), commandName === '_put' ? null : payload);
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
            logger.info(`ssh: server had been exiting before closing. Exit code: ${code}`);
            const promiseExit = () => {
              return code && code !== 0 ? reject(this.errorHandler(code, err)) : resolve(clean(res));
            };
            // sometimes the connection 'exit' before 'close' and then it doesn't have the data (err) ready yet.
            // in that case, we prefer to wait until the onClose will terminate the promise.
            // sometimes though, the connection only 'exit' and never 'close' (happened when _put command sent back
            // more than 1MB of data), in that case, the following setTimeout will terminate the promise.
            setTimeout(promiseExit, 2000);
          })
          .on('close', (code, signal) => {
            if (commandName === '_put') res = res.replace(payload, '');
            logger.debug(`ssh: returned with code: ${code}, signal: ${signal}.`);
            // DO NOT CLOSE THE CONNECTION (using this.connection.end()), it causes bugs when there are several open
            // connections. Same bugs occur when running "this.connection.end()" on "end" or "exit" events.
            return code && code !== 0 ? reject(this.errorHandler(code, err)) : resolve(clean(res));
          })
          .stderr.on('data', (response) => {
            err = response.toString();
            logger.error(`ssh: got an error, ${err}`);
          });
      });
    });
  }

  errorHandler(code, err) {
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
        return new PermissionDenied(`${this.host}:${this.path}`);
      case 129:
        return new RemoteScopeNotFound((parsedError && parsedError.id) || err);
      case 130:
        return new PermissionDenied(`${this.host}:${this.path}`);
      case 131:
        return new MergeConflict((parsedError && parsedError.id) || err);
    }
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
    return this.exec('_put', ComponentObjects.manyToString(manyComponentObjects)).then((data: string) => {
      const { headers } = this._unpack(data);
      checkVersionCompatibility(headers.version);
      return Promise.resolve();
    });
  }

  deleteMany(bitIds: Array<BitId>, force: boolean): Promise<ComponentObjects[]> {
    return this.exec('_delete', {
      bitIds: bitIds.map(id => id.toStringWithoutVersion()),
      force
    }).then((data: string) => {
      const { payload } = this._unpack(data);
      return Promise.resolve(payload);
    });
  }
  deprecateMany(bitIds: string): Promise<ComponentObjects[]> {
    return this.exec('_deprecate', {
      bitIds: bitIds.map(x => x.toStringWithoutVersion())
    }).then((data: string) => {
      const { payload } = this._unpack(data);
      return Promise.resolve(payload);
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
    return this.exec('_list').then((str: string) => {
      const { payload, headers } = this._unpack(str);
      checkVersionCompatibility(headers.version);
      return rejectNils(
        payload.map((c) => {
          return c ? ConsumerComponent.fromString(c) : null;
        })
      );
    });
  }

  latestVersions(componentIds: BitId[]) {
    return this.exec('_latest', componentIds).then((str: string) => {
      const { payload, headers } = this._unpack(str);
      checkVersionCompatibility(headers.version);
      return payload;
    });
  }

  search(query: string, reindex: boolean) {
    return this.exec('_search', { query, reindex: reindex.toString() }).then((data) => {
      const { payload, headers } = this._unpack(data);
      checkVersionCompatibility(headers.version);
      return payload;
    });
  }

  show(id: BitId): Promise<?ConsumerComponent> {
    return this.exec('_show', id.toString()).then((str: string) => {
      const { payload, headers } = this._unpack(str);
      checkVersionCompatibility(headers.version);
      return str ? ConsumerComponent.fromString(payload) : null;
    });
  }

  fetch(ids: BitIds, noDeps: boolean = false): Promise<ComponentObjects[]> {
    let options = '';
    ids = ids.map(bitId => bitId.toString());
    if (noDeps) options = '-n';
    return this.exec(`_fetch ${options}`, ids).then((str: string) => {
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

  composeConnectionObject(key: ?string, passphrase: ?string) {
    const base = {
      username: this.username,
      host: this.host,
      port: this.port,
      passphrase,
      readyTimeout: DEFAULT_SSH_READY_TIMEOUT
    };

    // if ssh-agent socket exists, use it.
    if (process.env.SSH_AUTH_SOCK) {
      return merge(base, { agent: process.env.SSH_AUTH_SOCK });
    }

    // otherwise just search for merge
    return merge(base, { privateKey: keyGetter(key) });
  }

  connect(key: ?string, passphrase: ?string): Promise<SSH> {
    const sshConfig = this.composeConnectionObject(key, passphrase);
    const self = this;

    function prompt() {
      return promptPassphrase().then((res) => {
        cachedPassphrase = res.passphrase;
        return self.connect(key, cachedPassphrase).catch(() => {
          return prompt();
        });
      });
    }

    return new Promise((resolve, reject) => {
      const conn = new SSH2();
      try {
        conn
          .on('error', err => reject(err))
          .on('ready', () => {
            this.connection = conn;
            resolve(this);
          })
          .connect(sshConfig);
      } catch (e) {
        if (e.message === PASSPHRASE_MESSAGE) {
          conn.end();
          if (cachedPassphrase) {
            return this.connect(key, cachedPassphrase).then(ssh => resolve(ssh));
          }

          return prompt().then(ssh => resolve(ssh));
        }

        return reject(e);
      }
    });
  }
}
