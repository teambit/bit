/** @flow */
import * as path from 'path';
import * as fs from 'fs';
import * as esprima from 'esprima';
import * as doctrine from 'doctrine';
import RepositoryFs from './repository-fs';
import { Repository } from '../repository';

export default class BitFs {
  static initiateRepository(repoPath: string): boolean {
    return RepositoryFs.createRepo(repoPath);
  }

  static locateRepository(absPath: string): ?string {
    return RepositoryFs.locateClosestRepo(absPath);
  }

  static getBitPath(name, repoPath) {
    
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

  static loadBit(name: string, repo: Repository) {
    if (!RepositoryFs.bitExists(name, repo.path)) return null;
    const contents = fs.readFileSync(this.composeBitPath(name, repo.path)).toString();
    return this.loadBitMeta(name, contents);
  }

  static addBit(bitName: string, repo: Repository) {
    if (this.bitExists(bitName, repo)) {
      throw new Error(`bit ${bitName} already exists!`);
    }

    return RepositoryFs.createBit(bitName, repo.path);
  }
  
  static bitExists(bitName: string, repo: Repository) {
    return RepositoryFs.bitExists(bitName, repo.path);
  }

  static moveInline() {

  }
}
