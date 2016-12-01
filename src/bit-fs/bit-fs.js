/** @flow */
import * as path from 'path';
import * as fs from 'fs';
import * as esprima from 'esprima';
import * as doctrine from 'doctrine';
import BoxFs from './box-fs';
import { Box } from '../box';

export default class BitFs {
  static initiateBox(boxPath: string): boolean {
    return BoxFs.createBox(boxPath);
  }

  static locateBox(absPath: string): ?string {
    return BoxFs.locateClosestBox(absPath);
  }

  static getBitPath(name, boxPath) {
    
  }

  static composeBitPath(name, boxPath, loc) {
    return path.resolve(boxPath, 'bits', loc, name, `${name}.js`);
  }

  static loadBitMeta(name: string, bitContents: string) {
    const ast = esprima.parse(bitContents, {
      loc: true,
      tolerant: true,
      attachComment: true
    });
    const rawDocs = ast.body[0].leadingComments[0].value;
    const docs = doctrine
      .parse(rawDocs, { unwrap: true })
      .tags.reduce(function (previousValue, currentValue) {
        previousValue[currentValue.title] = currentValue.description || currentValue.name;
        return previousValue;
      }, {});
    
    return {
      name: docs.name,
      version: docs.version,
      env: docs.env,
      dependencies: docs.dependencies,
      sig: docs.sig,
      examples: docs.example
    };
  }

  static loadBit(name: string, repo: Box) {
    function returnBit(loc) {
      return loadMeta(
        name, 
        fs.readFileSync(composePath(name, repo.path, loc)).toString()
      );
    }

    const loadMeta = this.loadBitMeta;
    const composePath = this.composeBitPath;

    if (BoxFs.bitExistsInline(name, repo.path)) return returnBit('inline');
    if (BoxFs.bitExistsExternal(name, repo.path)) return returnBit('external');
    
    return null;
  }

  static addBit(bitName: string, box: Box) {
    if (BoxFs.bitExistsInline(bitName, box.path)) {
      throw new Error(`bit ${bitName} already exists!`);
    }

    return BoxFs.createBit(bitName, box.path);
  }

  static removeBit(bitName: string, box: Box) {
    if (!BoxFs.bitExist(bitName, box.path)) {
      throw new Error(`no bit named ${bitName} found!`);
    }

    return BoxFs.removeBit(bitName, box.path);
  }


  static exportBit(bitName: string, box: Box) {
    if (!BoxFs.bitExistsInline(bitName, box.path)) {
      throw new Error(`bit ${bitName} does not exists in your inline box, please use "bit create ${bitName}" first"`);
    }
    
    if (BoxFs.bitExistsExternal(bitName, box.path)) {
      throw new Error(`bit ${bitName} already exists in the external library, please remove it first (TODO)"`);
      // TODO - we need to decide how we do the overriding
    }

    return BoxFs.exportBit(bitName, box.path);
  }

  static moveInline() {

  }
}
