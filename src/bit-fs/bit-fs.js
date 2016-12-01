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

  static composeBitPath(name, repoPath) {
    return path.resolve(repoPath, 'bits', 'inline', name, `${name}.js`);
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
    if (!BoxFs.bitExistsInline(name, repo.path)) return null;
    const contents = fs.readFileSync(this.composeBitPath(name, repo.path)).toString();
    return this.loadBitMeta(name, contents);
  }

  static addBit(bitName: string, repo: Box) {
    if (BoxFs.bitExistsInline(bitName, repo.path)) {
      throw new Error(`bit ${bitName} already exists!`);
    }

    return BoxFs.createBit(bitName, repo.path);
  }

  static exportBit(bitName: string, repo: Box) {
    if (!BoxFs.bitExistsInline(bitName, repo.path)) {
      throw new Error(`bit ${bitName} does not exists in your inline box, please use "bit create ${bitName}" first"`);
    }
    
    if (BoxFs.bitExistsImported(bitName, repo.path)) {
      throw new Error(`bit ${bitName} already exists in the imported library, please remove it first (TODO)"`);
      // TODO - we need to decide how we do the overriding
    }

    return BoxFs.exportBit(bitName, repo.path);
  }

  static moveInline() {

  }
}
