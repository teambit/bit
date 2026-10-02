import type { Plugin } from 'esbuild';
import { basename } from 'path';
import { MCP_RULES_TEMPLATE_FILENAMES } from '@teambit/mcp.mcp-config-writer';

/**
 * The main runtime never renders anything, but it transitively imports UI modules that pull in
 * stylesheets and mdx. Resolve them to an empty CJS module instead of failing the build.
 *
 * This replaces `esbuild-plugin-ignore` used by `bit-bundle2` - one less dependency, and it keeps
 * the ignore list next to the reason for it.
 */
const IGNORED = /\.(css|scss|sass|less|mdx|md)$/;

/**
 * `.md` files `getDefaultRulesContent` deliberately `require()`s for their real text content (see
 * `mcp-config-writer.ts`, gated on `BIT_IS_BUNDLE`) - these must reach `run-esbuild.ts`'s `.md`
 * text loader instead of being stripped like incidental doc files. Sourced from the component
 * itself so a new template file there doesn't also need a second, easy-to-forget edit here.
 */
const KEEP_MD = new Set<string>(MCP_RULES_TEMPLATE_FILENAMES);

export function ignoreAssetsPlugin(): Plugin {
  return {
    name: 'bit-ignore-assets',
    setup(build) {
      build.onResolve({ filter: IGNORED }, (args) => {
        if (KEEP_MD.has(basename(args.path))) return undefined;
        return { path: args.path, namespace: 'bit-ignored-asset' };
      });
      build.onLoad({ filter: /.*/, namespace: 'bit-ignored-asset' }, () => ({
        contents: 'module.exports = {};',
        loader: 'js',
      }));
    },
  };
}
