/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createTemplate from '../templates/impl.default-template';
import BitJson from '../../bit-json';
import { DEFAULT_IMPL_NAME } from '../../constants';
import loadPlugin from '../environment/load-plugin';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, DEFAULT_IMPL_NAME); 
}

export default class Impl extends Source {
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(composePath(bitPath), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  static load(bitPath: string): Promise<Impl> {
    return new Promise((resolve, reject) => 
      fs.readFile(composePath(bitPath), (err, data) => {
        if (err) return reject(err);
        return resolve(new Impl(data.toString()));
      })
    );
  }

  static create(bitJson: BitJson): Impl {
    function getTemplate() {
      console.log(bitJson.getCompilerName());
      try {
        const testerModule = loadPlugin(bitJson.getCompilerName());
        return testerModule.getTemplate(bitJson.name);
      } catch (e) {
        return createTemplate(bitJson);
      }
    }

    return new Impl(getTemplate());
  }
}
