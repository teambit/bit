import { StorageResolver } from './storage-resolver';
import { Artifact } from '../artifact';

export class DefaultResolver implements StorageResolver {
  name: 'default';

  async store(artifacts: Artifact[]) {}
}
