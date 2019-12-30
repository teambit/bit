import { LevelUp } from 'levelup';

export default class Repository {
  constructor(private db: LevelUp) {}

  public async get(key: string): Promise<any> {
    try {
      const data = await this.db.get(key);
      return JSON.parse(data);
    } catch (error) {
      return Promise.resolve();
    }
  }

  public async put(key: string, val: string): Promise<void> {
    await this.db.put(key, val);
  }

  public async del(key: string): Promise<void> {
    await this.db.del(key);
  }

  public batch(ops: Array<{ type: string; key: string; value: string }>) {
    // @ts-ignore
    return this.db.batch(ops);
  }

  public getAll(key = true, vals = true): Promise<Array<{ key: string; value: any }>> {
    return new Promise((resolve, reject) => {
      const keys: Array<{ key: string; value: any }> = [];
      this.db
        .createReadStream({ keys: key, values: vals })
        .on('data', function(data: { key: string; value: any }) {
          try {
            const val = JSON.parse(data.value);
            data.value = val;
            keys.push(data);
          } catch (e) {
            // this.del(data.key)
          }
        })
        .on('error', function(err) {
          // console.log('Oh my!', err);
          reject(err);
        })
        .on('close', function() {})
        .on('end', function() {
          // console.log('Stream ended');

          return resolve(keys);
        });
    });
  }

  public keys(): Promise<any> {
    return new Promise((resolve, reject) => {
      const keys: Array<string> = [];
      this.db
        .createKeyStream()
        .on('data', function(data) {
          keys.push(data);
        })
        .on('error', function(err) {
          // console.log('Oh my!', err);
          reject(err);
        })
        .on('close', function() {})
        .on('end', function() {
          // console.log('Stream ended');
          return resolve(keys);
        });
    });
  }
}
