/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createSpecs from '../templates/specs.template';
import BitJson from '../../bit-json';
import { SPEC_FILE_NAME } from '../../constants';
import PluginNotFoundException from '../exceptions/plugin-not-found';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, SPEC_FILE_NAME); 
}

export default class Specs extends Source {
  
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.src // @TODO - how do we get the default template
      .then((template) => {
        fs.writeFile(composePath(bitPath), template, (err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
      })
      .catch((err) => {
        if (err instanceof PluginNotFoundException) {
          // TODO: maybe write to a log file "tester had been set in bit.json but not installed"
          return resolve(); // that's fine, the tester wasn't installed
        }
        return reject(err);
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

  static create(bitJson: BitJson) {
    return new Specs(createSpecs(bitJson)); 
  }
}
