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
    if (!BoxFs.bitExists(name, repo.path)) return null;
    const contents = fs.readFileSync(this.composeBitPath(name, repo.path)).toString();
    return this.loadBitMeta(name, contents);
  }

  static addBit(bitName: string, repo: Box) {
    if (this.bitExists(bitName, repo)) {
      throw new Error(`bit ${bitName} already exists!`);
    }

    return BoxFs.createBit(bitName, repo.path);
  }
  
  static bitExists(bitName: string, repo: Box) {
    return BoxFs.bitExists(bitName, repo.path);
  }

  static moveInline() {

  }
}
