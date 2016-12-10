/** @flow */
import keyGetter from './public-key-getter';

const sequest = require('sequest');

export default class SSH {
  connection: any;

  constructor(connection: any) {
    // console.log(connection);
    this.connection = connection;
  }

  get(commandName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.connection('ls', (e, d) => resolve(d));
    });
  }

  push(pack: Buffer, path: string) {
    return new Promise((resolve, reject) => {
      const writer = this.connection.put(path);
      writer
        .on('close', resolve)
        .on('error', reject)
        .pipe(pack);
    });
  }

  close() {
    this.connection.end();
  }
 
  static connect(host: string): SSH {
    const con = sequest.connect('ranmizrahi@127.0.0.1', {
      // publicKey: keyGetter(),
      username: 'ranmizrahi',
      password: 'a6710462'
    });

    // con.pipe(process.stdout);
    return new SSH(con);
  }
}
