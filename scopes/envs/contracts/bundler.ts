import type { Server } from 'http';
import type { LaneId } from '@teambit/lane-id';
import type { Component } from './component';
import type { Network } from './capsule';
import type { ExecutionContext } from './execution-context';

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
   * A map of assets names for each chunk.
   */
  assetsByChunkName?: ChunksAssetsMap;

  /**
   * A map of assets for each entry point.
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

/**
 * interface for implementing dev servers.
 */
export interface DevServer {
  /**
   * attach to given port and start an http server
   */
  listen(port: number): Server | Promise<Server>;

  /**
   * display name of the dev server.
   */
  displayName?: string;

  /**
   * icon of the dev server.
   */
  icon?: string;

  /**
   * serialized config of the dev server.
   */
  displayConfig?(): string;

  /**
   * path to the config in the filesystem.
   */
  configPath?: string;

  /**
   * id of the dev server.
   */
  id: string;

  /**
   * hash of the dev server. used to dedupe dev servers.
   */
  hash?(): string;

  /**
   * return the dev server version.
   */
  version?(): string;

  [key: string]: any;
}

export interface DevServerContext extends ExecutionContext {
  /**
   * array of files to include.
   */
  entry: string[];

  /**
   * public path.
   */
  publicPath: string;

  /**
   * root path of the dev server.
   */
  rootPath: string;

  /**
   * title of the page.
   */
  title?: string;

  /**
   * favicon of the page.
   */
  favicon?: string;

  /**
   * a path to a host root dir. used for the env template bundle.
   */
  hostRootDir?: string;

  /**
   * dependencies that are bundled with the env template and are externals for the component bundle.
   */
  hostDependencies?: string[];

  /**
   * whether to externalize the host dependencies.
   */
  externalizeHostDependencies?: boolean;

  /**
   * whether to alias the host dependencies.
   */
  aliasHostDependencies?: boolean;
}

export type LibraryOptions = {
  /**
   * name of the library.
   */
  name: string;

  /**
   * type of the library.
   */
  type?: string;
};

export type BundlerEntry = {
  filename: string;
  import: string | string[];
  library?: LibraryOptions;
};

export type BundlerEntryMap = {
  [entryName: string]: BundlerEntry;
};

export type ModuleTarget = {
  /**
   * name of the module.
   */
  name: string;

  /**
   * module exposes.
   */
  exposes: {
    [internalPath: string]: string;
  };

  shared: {
    [key: string]: any;
  };
};

export type BundlerHtmlConfig = {
  /**
   * The title to use for the generated HTML document
   */
  title: string;
  /**
   * The file to write the HTML to. Defaults to index.html
   */
  filename?: string;
  /**
   * Allows you to add only some chunks (e.g only the unit-test chunk)
   */
  chunks?: string[];
  /**
   * Allows to control how chunks should be sorted before they are included to the HTML.
   */
  chunkOrder?: 'auto' | 'manual';
  /**
   * provide an inline template
   */
  templateContent: string;
  /**
   * Controls if and in what ways the output should be minified
   */
  minify?: boolean;
  /**
   * favicon of the page.
   */
  favicon?: string;
};

export type Chunking = {
  /**
   * whether to split chunks.
   */
  splitChunks: boolean;
};

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[] | BundlerEntryMap;

  /**
   * array of components included in the target.
   */
  components: Component[];

  /**
   * A map of component id string -> component directory.
   */
  componentDirectoryMap?: {
    [componentId: string]: string;
  };

  /**
   * output path of the target
   */
  outputPath: string;

  /**
   * output filename of the bundle.
   */
  filename?: string;

  /**
   * output filename of the chunks.
   */
  chunkFilename?: string;

  /**
   * whether to compress the output.
   */
  compress?: boolean;

  /**
   * list of peers to externalize.
   */
  peers?: string[];

  /**
   * config for html generation.
   */
  html?: BundlerHtmlConfig[];

  /**
   * module federation namings.
   */
  modules?: ModuleTarget[];

  /**
   * name for the runtime chunk.
   */
  runtimeChunkName?: string;

  /**
   * different configuration related to chunking.
   */
  chunking?: Chunking;

  /**
   * a path to a host root dir. used for the env template bundle.
   */
  hostRootDir?: string;

  /**
   * dependencies that are bundled with the env template and are externals for the component bundle.
   */
  hostDependencies?: string[];

  /**
   * whether to externalize the host dependencies.
   */
  externalizeHostDependencies?: boolean;

  /**
   * whether to alias the host dependencies.
   */
  aliasHostDependencies?: boolean;
};

export type BundlerContextMetaData = {
  /**
   * the initiator of the bundling process.
   */
  initiator?: string;

  /**
   * the env id of the bundled components.
   */
  envId?: string;

  /**
   * whether the bundle is of an env template.
   */
  isEnvTemplate?: boolean;
};

export interface BundlerContext extends ExecutionContext {
  /**
   * components to bundle.
   */
  components: Component[];

  /**
   * the capsules network of the build.
   */
  capsuleNetwork: Network;

  /**
   * results of the previous build tasks.
   */
  previousTasksResults: unknown[];

  /**
   * whether the bundle is for development.
   */
  dev?: boolean;

  /**
   * the build pipeline.
   */
  pipeName: 'build' | 'tag' | 'snap';

  /**
   * current lane id, if any.
   */
  laneId?: LaneId;

  /**
   * targets for bundling.
   */
  targets: Target[];

  /**
   * whether to run in development mode.
   */
  development?: boolean;

  /**
   * public path output of the bundle.
   */
  publicPath?: string;

  /**
   * root path of the bundle.
   */
  rootPath?: string;

  /**
   * whether to compress the output.
   */
  compress?: boolean;

  /**
   * config for html generation for all targets.
   */
  html?: BundlerHtmlConfig[];

  /**
   * module federation namings for all targets.
   */
  modules?: {
    name: string;
    fileName: string;
    exposes: { [key: string]: string };
  };

  /**
   * additional info that can be used by the bundler.
   */
  metaData?: BundlerContextMetaData;
}
