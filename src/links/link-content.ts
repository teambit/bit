import { getExt } from '../utils';

const LINKS_CONTENT_TEMPLATES = {
  js: "module.exports = require('{filePath}');",
  ts: "export * from '{filePath}';",
  jsx: "export * from '{filePath}';",
  tsx: "export * from '{filePath}';",
  css: "@import '{filePath}.css';",
  scss: "@import '{filePath}.scss';",
  sass: "@import '{filePath}.sass';",
  less: "@import '{filePath}.less';",
  vue: "<script>\nmodule.exports = require('{filePath}.vue');\n</script>",
};

export const JAVASCRIPT_FLAVORS_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx'];
export const EXTENSIONS_TO_STRIP_FROM_PACKAGES = ['js', 'ts', 'jsx', 'tsx', 'd.ts'];
export const EXTENSIONS_TO_REPLACE_TO_JS_IN_PACKAGES = ['ts', 'jsx', 'tsx'];
// node-sass doesn't resolve directories to 'index.scss', @see https://github.com/sass/sass/issues/690
export const EXTENSIONS_NOT_SUPPORT_DIRS = ['scss', 'sass'];

export function isSupportedExtension(filePath: string) {
  const ext = getExt(filePath);
  const supportedExtensions = getSupportedExtensions();
  return supportedExtensions.includes(ext);
}

function getSupportedExtensions(): string[] {
  return Object.keys(LINKS_CONTENT_TEMPLATES);
}
