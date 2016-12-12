/** @flow */
import keyGetter from './public-key-getter';
import Bit from '../../bit';
import { bufferToReadStream } from '../../utils';

const sequest = require('sequest');

export default class SSH {
  connection: any;

  constructor(connection: any) {
    // console.log(connection);
    this.connection = connection;
  }

  get(commandName: string, ...args: string[]): Promise<any> {
    function serialize() {
      return args.join(' ');
    }

    return new Promise((resolve, reject) => {
      // const cmd = `bit ${commandName} ${serialize()}`;
      this.connection('/bin/ls', function (err, res, o) {
        console.log(err, res);
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  putFile(path: string, buffer: Buffer) {
    return new Promise((resolve, reject) => {
      const writer = this.connection.put(path);
      writer
        .on('close', resolve)
        .on('error', reject)
        .pipe(bufferToReadStream(buffer));
    });
  }

  push(bit: Bit) {
    return bit.toTar().then((tarBuffer: Buffer) => {
      return this.get('prepare', bit.name, bit.bitJson.toJson(false))
        .then(path => this.putFile(path, tarBuffer))
        .then(() => this.get('process'));
    });
  }

  close() {
    this.connection.end();
  }
 
  static connect(host: string): SSH {
    const con = sequest.connect(host, {
      publicKey: keyGetter(),
    });

    return new SSH(con);
  }
}
