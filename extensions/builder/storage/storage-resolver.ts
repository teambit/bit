import { Artifact } from '../artifact';

export interface StorageResolver {
  store(artifacts: Artifact[]): Promise<void>;
}
