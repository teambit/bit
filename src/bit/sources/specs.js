/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import BitJson from '../../bit-json';
import createTemplate from '../templates/specs.default-template';
import { DEFAULT_SPEC_NAME } from '../../constants';
import loadPlugin from '../environment/load-plugin';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, DEFAULT_SPEC_NAME); 
}

export default class Specs extends Source {
  
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.writeFile(composePath(bitPath), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
  
  static load(bitPath: string): Promise<?Specs> {
    return new Promise(resolve => 
      fs.readFile(composePath(bitPath), (err, data) => {
        if (err) return resolve(); // when cant load specs it's ok, just return undefined';
        return resolve(new Specs(data.toString()));
      })
    );
  }

  static create(bitJson: BitJson): Spec {
    function getTemplate() {
      console.log(bitJson.getTesterName());
      try {
        const testerModule = loadPlugin(bitJson.getTesterName());
        return testerModule.getTemplate(bitJson.name);
      } catch (e) {
        return createTemplate(bitJson);
      }
    }

    return new Spec(getTemplate());
  }
}
