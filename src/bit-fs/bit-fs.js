/** @flow */
import RepositoryFs from './repository-fs';
import { Repository } from '../repository';

export default class BitFs {
  static initiateRepository(path: string): boolean {
    return RepositoryFs.createRepo(path);
  }

  static locateRepository(absPath: string): ?string {
    return RepositoryFs.locateClosestRepo(absPath);
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
