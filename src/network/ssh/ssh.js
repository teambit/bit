/** @flow */
import keyGetter from './key-getter';
import Bit from '../../bit';
import { RemoteScopeNotFound } from '../exceptions';
import { BitId, BitIds } from '../../bit-id';
import { toBase64, fromBase64 } from '../../utils';
import { BitDependencies } from '../../scope';
import type { SSHUrl } from '../../utils/parse-ssh-url';
import type { ScopeDescriptor } from '../../scope/scope';

const sequest = require('sequest');

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
      const cmd = this.buildCmd(commandName, absolutePath(this.path || ''), ...args);
      this.connection(cmd, function (err, res, o) {
        if (err) return reject(err);
        return resolve(clean(res));
      });
    });
  }

  putBit(name: string, bitTar: Buffer) {
    return this.exec('_put', name, bitTar);
  }

  push(bit: Bit) {
    return bit.toTar().then((tarBuffer: Buffer) => {
      return this.putBit(bit.name, tarBuffer);
    });
  }

  // putMany(bits: Bit[]) {

  // }

  describeScope(): Promise<ScopeDescriptor> {
    return this.exec('_scope')
      .then((data) => {
        return JSON.parse(fromBase64(data));
      })
      .catch(() => {
        throw new RemoteScopeNotFound();
      });
  }

  fetch(bitIds: BitIds): Promise<BitDependencies[]> {
    bitIds = bitIds.map(bitIds.map(bitId => bitId.toString()));
    return this.exec('_fetch', ...bitIds)
      .then((packs) => {
        return packs
          .split('!!!')
          .map(pack => BitDependencies.deserialize(pack));
      });
  }

  close() {
    this.connection.end();
    return this;
  }

  composeConnectionUrl() {
    return `${this.username}@${this.host}:${this.port}`;
  }
 
  connect(sshUrl: SSHUrl, key: ?string): SSH {
    this.connection = sequest.connect(this.composeConnectionUrl(), {
      privateKey: keyGetter(key)
    });

    return Promise.resolve(this);
  }
}
