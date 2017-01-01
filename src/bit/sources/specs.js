/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import BitJson from '../../bit-json';
import createTemplate from '../templates/specs.default-template';
import loadPlugin from '../environment/load-plugin';

export default class Specs extends Source {
  
  write(bitPath: string, fileName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(bitPath, fileName), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
  
  static load(bitPath: string, fileName: string): Promise<?Specs> {
    return new Promise(resolve => 
      fs.readFile(path.join(bitPath, fileName), (err, data) => {
        if (err) return resolve(); // when cant load specs it's ok, just return undefined';
        return resolve(new Specs(data.toString()));
      })
    );
  }

  static create(bitJson: BitJson): Specs {
    function getTemplate() {
      console.log(bitJson.getTesterName()); // @TODO make sure it get the template 
      try {
        const testerModule = loadPlugin(bitJson.getTesterName());
        return testerModule.getTemplate(bitJson.name);
      } catch (e) {
        return createTemplate(bitJson);
      }
    }

    return new Specs(getTemplate());
  }
}
