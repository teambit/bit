/** @flow */
import fs from 'fs';
import path from 'path';
import AbstractBitJson from './abstract-bit-json';
import { BitJsonNotFound, BitJsonAlreadyExists } from './exceptions';
import { BIT_JSON } from '../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export default class ConsumerBitJson extends AbstractBitJson {
  impl: string;
  spec: string; 
  compiler: string;
  tester: string;
  remotes: {[string]: string};
  dependencies: {[string]: string};
  
  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const repspond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        composePath(bitDir),
        this.toJson(),
        repspond
      );
    });
  }

  static create(): ConsumerBitJson {
    return new ConsumerBitJson({});
  }

  static load(dirPath: string): Promise<ConsumerBitJson> {
    return new Promise((resolve, reject) => {
      if (!hasExisting(dirPath)) return reject(new BitJsonNotFound());
      return fs.readFile(composePath(dirPath), (err, data) => {
        if (err) return reject(err);
        const file = JSON.parse(data.toString('utf8'));
        return resolve(this.fromPlainObject(file));
      });
    });
  }
}
