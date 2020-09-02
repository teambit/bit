import { manifestsMap } from './manifests';

export type BitDeps = [];

export type BitConfig = {};

export async function provideBit() {
  return {
    manifestsMap,
  };
}
