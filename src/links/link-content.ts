import normalize from 'normalize-path';
import R from 'ramda';

import { ImportSpecifier } from '../consumer/component/dependencies/files-dependency-builder/types/dependency-tree-type';
import logger from '../logger/logger';
import { getExt, getWithoutExt } from '../utils';
import { PathOsBased } from '../utils/path';

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

const PACKAGES_LINKS_CONTENT_TEMPLATES = {
  css: "@import '~{filePath}';",
  scss: "@import '~{filePath}';",
  sass: "@import '~{filePath}';",
  less: "@import '~{filePath}';",
  'st.css': ':import { -st-from: "{filePath}";}',
  vue: "<script>\nmodule.exports = require('{filePath}');\n</script>",
};

const fileExtensionsForNpmLinkGenerator = ['js', 'ts', 'jsx', 'tsx'];

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

export function getLinkToFileContent(filePath: PathOsBased, importSpecifiers?: ImportSpecifier[]): string {
  const fileExt = getExt(filePath);
  if (!filePath.startsWith('.')) {
    filePath = `./${filePath}`; // it must be relative, otherwise, it'll search it in node_modules
  }
  const filePathWithoutExt = getWithoutExt(filePath);
  const template = getTemplateForFileOrPackage(fileExt, importSpecifiers, false);

  if (!template) return _logWhenNoTemplateWasFound(filePath, fileExt);
  return template.replace(/{filePath}/g, normalize(filePathWithoutExt));
}

export function getLinkToPackageContent(
  filePath: PathOsBased,
  bitPackageName: string,
  importSpecifiers?: ImportSpecifier[]
): string {
  const fileExt = getExt(filePath);
  const template = getTemplateForFileOrPackage(fileExt, importSpecifiers);
  if (!template) return _logWhenNoTemplateWasFound(filePath, fileExt);
  return template.replace(/{filePath}/g, bitPackageName);
}

function getSupportedExtensions(): string[] {
  return Object.keys(LINKS_CONTENT_TEMPLATES);
}

/**
 * Get the template for the generated link file.
 *
 * For ES6 and TypeScript the template is more complicated and we often need to know how originally the variables were
 * imported, whether default (e.g. import foo from './bar') or non-default (e.g. import { foo } from './bar').
 *
 * The importSpecifier.linkFile attribute exists when the main-file doesn't require the variable directly, but uses a
 * link-file to require it indirectly. E.g. src/bar.js: `import foo from './utils;` utils/index.js: `import foo from './foo';`
 */
function getTemplateForFileOrPackage(fileExt: string, importSpecifiers?: ImportSpecifier[], isForPackage = true) {
  if (importSpecifiers && importSpecifiers.length) {
    if (fileExt === 'js' || fileExt === 'jsx') {
      // @see e2e/flows/es6-link-files.e2e.js file for cases covered by the following snippet
      return es6TemplateWithImportSpecifiers(importSpecifiers);
    }
    if (fileExt === 'ts' || fileExt === 'd.ts' || fileExt === 'tsx') {
      return tsTemplateWithImportSpecifiers(importSpecifiers);
    }
  }
  if (isForPackage && !fileExtensionsForNpmLinkGenerator.includes(fileExt)) {
    return PACKAGES_LINKS_CONTENT_TEMPLATES[fileExt];
  }
  return _getTemplate(fileExt);
}

function _getTemplate(fileExt: string) {
  return LINKS_CONTENT_TEMPLATES[fileExt];
}

function _logWhenNoTemplateWasFound(filePath: string, fileExt: string) {
  logger.debug(`no template was found for ${filePath}, because .${fileExt} extension is not supported`);
  return '';
}

function tsTemplateWithImportSpecifiers(importSpecifiers) {
  return importSpecifiers
    .map((importSpecifier) => {
      let importPart = 'import ';
      if (
        (importSpecifier.linkFile && importSpecifier.linkFile.isDefault) ||
        (!importSpecifier.linkFile && importSpecifier.mainFile.isDefault)
      ) {
        importPart += `${importSpecifier.mainFile.name}`;
      } else {
        importPart += `{ ${importSpecifier.mainFile.name} }`;
      }
      importPart += " from '{filePath}';";
      let exportPart = 'export ';
      if (importSpecifier.mainFile.isDefault) {
        exportPart += `default ${importSpecifier.mainFile.name};`;
      } else {
        exportPart += `{ ${importSpecifier.mainFile.name} };`;
      }
      return `${importPart}\n${exportPart}`;
    })
    .join('\n');
}

function es6TemplateWithImportSpecifiers(importSpecifiers) {
  return R.uniq(
    importSpecifiers.map((importSpecifier) => {
      if (!importSpecifier.linkFile) {
        // when no link-file is involved, use the standard non-es6 syntax (a privilege that doesn't exist for TS)
        return LINKS_CONTENT_TEMPLATES.js;
      }
      // for link files we need to know whether the main-file imports the variable as default or non-default
      let exportPart = 'exports';
      if (importSpecifier.mainFile.isDefault) {
        exportPart += '.default';
      } else {
        exportPart += `.${importSpecifier.mainFile.name}`;
      }
      const linkVariable = `_${importSpecifier.linkFile.name}`;
      const linkRequire = `var ${linkVariable} = require('{filePath}');`;
      // when add-module-export babel plugin is used, there is no .default
      // the link-file should support both cases, with and without that plugin
      const pathPart = importSpecifier.linkFile.isDefault
        ? `${linkVariable} && ${linkVariable}.hasOwnProperty('default') ? ${linkVariable}.default : ${linkVariable}`
        : `${linkVariable}.${importSpecifier.mainFile.name}`;
      return `${linkRequire}\n${exportPart} = ${pathPart};`;
    })
  ).join('\n');
}
