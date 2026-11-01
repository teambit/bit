"use strict";

/**
 * Inlined from @teambit/mdx.modules.mdx-pre-loader in CJS format.
 *
 * This loader is inlined to avoid an external dependency and to ensure compatibility across environments
 * where the original package may not be available or may introduce unnecessary overhead.
 *
 * scopes/preview/preview/rspack/mdx-pre-loader.cjs is a copy of this file (preview can't depend on
 * @teambit/react without a circular dependency). Keep the two copies in sync.
 *
 * Loader purpose: Transforms MDX admonition syntax from ':::type content' to ':::type[content]'
 * for MDX v3 compatibility.
 */

function t(r) {
  return r.replace(/:::(\w+) (.+)/g, ":::$1[$2]")
}

function e(r) {
  return this.resourcePath.endsWith(".mdx") ? t(r) : r
}

module.exports = e;
