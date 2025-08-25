import type { Component } from '@teambit/component';

export interface DevServer {
  start(): void;
}

export type Asset = {
  /**
   * name of the asset.
   */
  name: string;

  /**
   * size of the asset in bytes.
   */
  size: number;

  /**
   * size of the compressed asset in bytes.
   */
  compressedSize?: number;
};

export type ChunksAssetsMap = {
  [assetName: string]: string[];
};

export type EntryAssets = {
  assets: Asset[];
  auxiliaryAssets: Asset[];
  assetsSize: number;
  compressedAssetsSize?: number;
  auxiliaryAssetsSize: number;
  compressedAuxiliaryAssetsSize: number;
};

export type EntriesAssetsMap = {
  [entryId: string]: EntryAssets;
};

export type BundlerResult = {
  /**
   * list of generated assets.
   */
  assets: Asset[];

  /**
   * A map of assets names for each chunk
   */
  assetsByChunkName?: ChunksAssetsMap;

  /**
   * A map of assets for each entry point
   */
  entriesAssetsMap?: EntriesAssetsMap;

  /**
   * errors thrown during the bundling process.
   */
  errors: Error[];

  /**
   * warnings thrown during the bundling process.
   */
  warnings: string[];

  /**
   * components included in the bundling process.
   */
  components: Component[];

  /**
   * timestamp in milliseconds when the task started
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended
   */
  endTime?: number;

  /**
   * out put path of the Bundler Result
   */
  outputPath?: string;
};

export interface Bundler {
  run(): Promise<BundlerResult[]>;
}

export type BundlerMode = 'dev' | 'prod';
