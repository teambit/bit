/** @flow */
import RepositoryFs from './repository-fs';

export default class BitFs {
  static initiateRepository(path: string): boolean {
    return RepositoryFs.createRepo(path);
  }

  static locateRepository(absPath: string): string {
    return RepositoryFs.locateClosestRepo(absPath);
  }

  static addBit() {

  }

  static moveInline() {

  }
}
