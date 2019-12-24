import _ from 'lodash';
import { LevelUp } from 'levelup';
import sub from 'subleveldown';
import { CAPSULE_MAP_DB } from '../../constants';
export class ComponentDB {
  constructor(workspace?: string) {
    if (!workspace) this.db = CAPSULE_MAP_DB;
    else this.db = sub(CAPSULE_MAP_DB, workspace);
  }
  private db: LevelUp;

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

  public keys(): Promise<any> {
    return new Promise((resolve, reject) => {
      const keys: Array<string> = [];
      this.db
        .createKeyStream()
        .on('data', function(data) {
          // console.log(data.key, '=', data.value);
          const x = data.split('!');
          keys.push(x[1]);
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
