import type { BundlerEntryMap } from '@teambit/bundler';

export const CHUNK_NAMES = {
  previewRoot: 'preview-root',
  peers: 'peers',
};

type templateEntryOptions = {
  previewRootPath: string;
  peers: string[];
  previewModules: {
    name: string;
    entry: string;
    /** other preview modules to includes */
    include?: string[];
  }[];
};

export function generateTemplateEntries(options: templateEntryOptions): BundlerEntryMap {
  const previewChunks = {};
  options.previewModules.forEach(({ name, entry, include = [] }) => {
    previewChunks[name] = {
      filename: `${name}.[chunkhash].js`,
      dependOn: [CHUNK_NAMES.peers, CHUNK_NAMES.previewRoot, ...include],
      import: entry,
    };
  });

  return {
    [CHUNK_NAMES.peers]: {
      filename: 'peers.[chunkhash].js',
      import: options.peers,
    },
    [CHUNK_NAMES.previewRoot]: {
      filename: 'preview-root.[chunkhash].js',
      dependOn: [CHUNK_NAMES.peers],
      import: options.previewRootPath,
    },
    ...previewChunks,
  };
}
