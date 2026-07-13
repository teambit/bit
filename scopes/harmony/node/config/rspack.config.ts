import type { RspackConfigMutator } from '@teambit/rspack.modules.rspack-config-mutator';

/**
 * Modifies the Rspack config for component preview bundles.
 *
 * - Adds resolve extensions and extensionAlias for ESM `.js` imports resolving to `.ts`/`.tsx` source.
 * - Polyfill fallback for `events`.
 *
 * @see https://bit.dev/reference/rspack/rspack-config
 */
export const rspackTransformer = (
  configMutator: RspackConfigMutator
): RspackConfigMutator => {
  configMutator.merge({
    resolve: {
      /**
       * File extensions to resolve automatically.
       * Order matters — TypeScript extensions come first so `.js` imports
       * resolve to `.ts`/`.tsx` source files when available.
       */
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
      /**
       * Maps `.js`/`.jsx` extensions in import specifiers to their
       * TypeScript equivalents, enabling ESM-style `.js` extension imports
       * to resolve directly to source files.
       */
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
      },
      fallback: {
        ...configMutator.raw.resolve?.fallback,
        events: false,
      },
    },
  });

  return configMutator;
};
