import { Component } from '@teambit/component';
import { BuildContext } from '@teambit/builder';

export type LibraryOptions = {
  /**
   * Specify a name for the library
   */
  name: string;
  // TODO: decide which exact types we want to support and their exact names
  /**
   * Configure how the library will be exposed
   * could be values like: 'umd', 'umd2', 'amd', 'commonjs',
   */
  type?: string;
};

export type Entry = {
  /**
   * Specifies the name of each output file on disk
   */
  filename: string;
  /**
   * Module(s) that are loaded upon startup
   */
  import: string | string[];

  /**
   * Specify library options to bundle a library from current entry
   */
  library?: LibraryOptions;
};

export type EntryMap = {
  [entryName: string]: Entry;
};

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[] | EntryMap;

  /**
   * array of components included in the target.
   */
  components: Component[];

  /**
   * output path of the target
   */
  outputPath: string;

  /**
   * This option determines the name of each output bundle
   */
  filename?: string;

  /**
   * This option determines the name of non-initial chunk files
   */
  chunkFilename?: string;

  /**
   * Make the peer dependencies externals.
   */
  externalizePeer?: boolean;

  /**
   * List of peer dependencies
   */
  peers?: string[];

  /**
   * config for html generation
   */
  html?: HtmlConfig[];

  /**
   * module targets to expose.
   */
  modules?: ModuleTarget[];

  /**
   * Name for the runtime chunk
   */
  runtimeChunkName?: string;

  /**
   * Different configuration related to chunking
   */
  chunking?: Chunking;
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

export type HtmlConfig = {
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
   * provide an inline template
   */
  templateContent: string;
  /**
   * Controls if and in what ways the output should be minified
   */
  minify?: boolean;
  // TODO: consider add chunksSortMode if there are more needs
};

export type Chunking = {
  /**
   * include all types of chunks (async / non-async) in splitting
   */
  splitChunks: boolean;
};
export interface BundlerContext extends BuildContext {
  /**
   * targets for bundling.
   */
  targets: Target[];

  /**
   * determines whether it is a production build, default is `true`.
   * in development, expect the bundler to favour debugging on the expanse of optimization.
   */
  development?: boolean;

  /**
   * public path output of the bundle.
   */
  publicPath?: string;

  /**
   * root path
   */
  rootPath?: string;

  /**
   * Make the peer dependencies externals for all targets
   */
  externalizePeer?: boolean;

  /**
   * config for html generation for all targets
   */
  html?: HtmlConfig[];

  /**
   * modules for bundle to expose. used by module federation at webpack, or with different methods applied by various bundlers.
   */
  modules?: {
    name: string;
    fileName: string;
    exposes: { [key: string]: string };
  };
}
