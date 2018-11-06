// @flow
import normalize from 'normalize-path';
import fileTypesPlugins from '../plugins/file-types-plugins';
import { getWithoutExt, getExt } from '../utils';
import logger from '../logger/logger';
import type { PathOsBased } from '../utils/path';
import type { ImportSpecifier } from '../consumer/component/dependencies/dependency-resolver/types/dependency-tree-type';

const LINKS_CONTENT_TEMPLATES = {
  js: "module.exports = require('{filePath}');",
  ts: "export * from '{filePath}';",
  jsx: "export * from '{filePath}';",
  tsx: "export * from '{filePath}';",
  css: "@import '{filePath}.css';",
  scss: "@import '{filePath}.scss';",
  sass: "@import '{filePath}.sass';",
  less: "@import '{filePath}.less';",
  vue: "<script>\nmodule.exports = require('{filePath}.vue');\n</script>"
};

const PACKAGES_LINKS_CONTENT_TEMPLATES = {
  css: "@import '~{filePath}';",
  scss: "@import '~{filePath}';",
  sass: "@import '~{filePath}';",
  less: "@import '~{filePath}';",
  'st.css': ':import { -st-from: "{filePath}";}',
  vue: "<script>\nmodule.exports = require('{filePath}');\n</script>"
};

const fileExtentionsForNpmLinkGenerator = ['js', 'ts', 'jsx', 'tsx'];

function getSupportedExtensions(): string[] {
  const extensions = Object.keys(LINKS_CONTENT_TEMPLATES);
  fileTypesPlugins.forEach((plugin) => {
    extensions.push(plugin.getExtension());
  });
  return extensions;
}

export function isSupportedExtension(filePath: string) {
  const ext = getExt(filePath);
  const supportedExtensions = getSupportedExtensions();
  return supportedExtensions.includes(ext);
}

export default function getLinkContent(
  filePath: PathOsBased,
  importSpecifiers?: ImportSpecifier[],
  createNpmLinkFiles?: boolean,
  bitPackageName?: string
): string {
  const fileExt = getExt(filePath);

  if (!filePath.startsWith('.')) {
    filePath = `./${filePath}`; // it must be relative, otherwise, it'll search it in node_modules
  }

  let filePathWithoutExt = getWithoutExt(filePath);
  const template = getTemplate(fileExt, filePath, importSpecifiers, createNpmLinkFiles);
  if (createNpmLinkFiles) {
    filePathWithoutExt = bitPackageName;
  }

  if (!template) {
    logger.debug(`no template was found for ${filePath}, because .${fileExt} extension is not supported`);
    return '';
  }
  return template.replace(/{filePath}/g, normalize(filePathWithoutExt));
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
function getTemplate(
  fileExt: string,
  filePath: PathOsBased,
  importSpecifiers?: ImportSpecifier[],
  createNpmLinkFiles?: boolean
) {
  if (importSpecifiers && importSpecifiers.length) {
    if (fileExt === 'js' || fileExt === 'jsx') {
      // @see e2e/flows/es6-link-files.e2e.js file for cases covered by the following snippet
      return es6TemplateWithImportSpecifiers(importSpecifiers);
    } else if (fileExt === 'ts' || fileExt === 'tsx') {
      return tsTemplateWithImportSpecifiers(importSpecifiers);
    }
  }
  fileTypesPlugins.forEach((plugin) => {
    LINKS_CONTENT_TEMPLATES[plugin.getExtension()] = plugin.getTemplate(importSpecifiers);
  });

  if (createNpmLinkFiles && !fileExtentionsForNpmLinkGenerator.includes(fileExt)) {
    return PACKAGES_LINKS_CONTENT_TEMPLATES[fileExt];
  }
  return LINKS_CONTENT_TEMPLATES[fileExt];
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
  return importSpecifiers
    .map((importSpecifier) => {
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
    .join('\n');
}
