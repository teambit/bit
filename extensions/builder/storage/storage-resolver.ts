import { Artifact } from '../artifact';

export interface StorageResolver {
  name: string;
  store(artifacts: Artifact[]): Promise<void>;
}
