import type { BundlerEntryMap } from '@teambit/bundler';

// TODO - we can remove the need to depenedOn preview-root, if we output chunks as "jsonp".
//
// for example:
//  config.entry.someJsonpChunk = {
//    import: "./xxx",
//    library: { type: "jsonp", name: "foobar" }
//  }
// will result in this output:
//  foobar(() => { ...; return MODULE })

export const CHUNK_NAMES = {
  previewRoot: 'preview-root',
  peers: 'peers',
};

type TemplateEntryOptions = {
  previewRootPath: string;
  peers: string | string[];
  previewModules: {
    name: string;
    entry: string;
    /** other preview modules to includes */
    include?: string[];
  }[];
};

export function generateTemplateEntries(options: TemplateEntryOptions): BundlerEntryMap {
  const previewChunks = {};
  options.previewModules.forEach(({ name, entry, include = [] }) => {
    previewChunks[name] = {
      dependOn: [CHUNK_NAMES.peers, CHUNK_NAMES.previewRoot, ...include],
      import: entry,
    };
  });

  return {
    [CHUNK_NAMES.peers]: options.peers,
    [CHUNK_NAMES.previewRoot]: {
      dependOn: [CHUNK_NAMES.peers],
      import: options.previewRootPath,
    },
    ...previewChunks,
  };
}
