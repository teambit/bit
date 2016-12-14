/** @flow */
import keyGetter from './key-getter';
import Bit from '../../bit';
import { bufferToReadStream, toBase64 } from '../../utils';
import type { SSHUrl } from '../../utils/parse-ssh-url';

const sequest = require('sequest');

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

    let path = '';
    if (this.path) path = `cd ${this.path}; `;
    const cmd = `${path}bit ${commandName} ${serialize()}`;

    return cmd; 
  }

  exec(commandName: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const cmd = this.buildCmd(commandName, ...args);
      this.connection(cmd, function (err, res, o) {
        if (err) return reject(err);
        return resolve(clean(res));
      });
    });
  }

  putBit(bitTar: Buffer) {
    return this.exec('_upload', bitTar)
      .then(status => console.log(status));
  }

  push(bit: Bit) {
    return bit.toTar().then((tarBuffer: Buffer) => {
      return this.exec('_prepare', bit.name, bit.bitJson.toJson(false))
        .then(() => this.putBit(tarBuffer));
    });
  }

  close() {
    this.connection.end();
  }

  composeConnectionUrl() {
    return `${this.username}@${this.host}:${this.port}`;
  }
 
  connect(sshUrl: SSHUrl, key: ?string): SSH {
    this.connection = sequest.connect(this.composeConnectionUrl(), {
      privateKey: keyGetter(key)
    });

    return this;
  }
}
