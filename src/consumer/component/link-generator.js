// @flow
import path from 'path';
import normalize from 'normalize-path';
import R from 'ramda';
import groupBy from 'lodash.groupby';
import {
  DEFAULT_DIST_DIRNAME,
  DEFAULT_INDEX_NAME,
  COMPONENT_ORIGINS,
  AUTO_GENERATED_MSG,
  CFG_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_REGISTRY_DOMAIN_PREFIX
} from '../../constants';
import { outputFile, getWithoutExt, searchFilesIgnoreExt, getExt } from '../../utils';
import logger from '../../logger/logger';
import { ComponentWithDependencies } from '../../scope';
import Component from '../component';
import BitMap from '../bit-map/bit-map';
import { BitIds } from '../../bit-id';
import fileTypesPlugins from '../../plugins/file-types-plugins';
import { getSync } from '../../api/consumer/lib/global-config';

const LINKS_CONTENT_TEMPLATES = {
  js: "module.exports = require('{filePath}');",
  ts: "export * from '{filePath}';",
  jsx: "export * from '{filePath}';",
  tsx: "export * from '{filePath}';",
  css: "@import '{filePath}.css';",
  scss: "@import '{filePath}.scss';",
  sass: "@import '{filePath}.sass';",
  less: "@import '{filePath}.less';"
};

const PACKAGES_LINKS_CONTENT_TEMPLATES = {
  css: "@import '~{filePath}';",
  scss: "@import '~{filePath}';",
  sass: "@import '~{filePath}';",
  less: "@import '~{filePath}';",
  'st.css': ':import { -st-from: "{filePath}";}'
};

const fileExtentionsForNpmLinkGenerator = ['js', 'ts', 'jsx', 'tsx'];

// todo: move to bit-javascript
function _getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}.${getExt(mainFile)}`;
}

// todo: move to bit-javascript
function _getLinkContent(
  filePath: string,
  importSpecifiers?: Object,
  createNpmLinkFiles?: boolean,
  bitPackageName: string
): string {
  const fileExt = getExt(filePath);
  /**
   * Get the template for the generated link file.
   *
   * For ES6 and TypeScript the template is more complicated and we often need to know how originally the variables were
   * imported, whether default (e.g. import foo from './bar') or non-default (e.g. import { foo } from './bar').
   *
   * The importSpecifier.linkFile attribute exists when the main-file doesn't require the variable directly, but uses a
   * link-file to require it indirectly. E.g. src/bar.js: `import foo from './utils;` utils/index.js: `import foo from './foo';`
   */
  const getTemplate = () => {
    if (importSpecifiers && importSpecifiers.length) {
      if (fileExt === 'js' || fileExt === 'jsx') {
        // @see e2e/flows/es6-link-files.e2e.js file for cases covered by the following snippet
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
            let pathPart = "require('{filePath}')";

            if (importSpecifier.linkFile.isDefault) {
              pathPart += '.default';
            } else {
              pathPart += `.${importSpecifier.mainFile.name}`;
            }

            return `${exportPart} = ${pathPart};`;
          })
          .join('\n');
      } else if (fileExt === 'ts' || fileExt === 'tsx') {
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
    }
    fileTypesPlugins.forEach((plugin) => {
      LINKS_CONTENT_TEMPLATES[plugin.getExtension()] = plugin.getTemplate(importSpecifiers);
    });

    if (createNpmLinkFiles && !fileExtentionsForNpmLinkGenerator.includes(fileExt)) {
      return PACKAGES_LINKS_CONTENT_TEMPLATES[fileExt];
    }
    return LINKS_CONTENT_TEMPLATES[fileExt];
  };

  if (!filePath.startsWith('.')) {
    filePath = `./${filePath}`; // it must be relative, otherwise, it'll search it in node_modules
  }

  let filePathWithoutExt = getWithoutExt(filePath);
  const template = getTemplate();
  if (createNpmLinkFiles) {
    filePathWithoutExt = bitPackageName;
  } else {
    filePathWithoutExt = getWithoutExt(filePath); // remove the extension
  }

  if (!template) {
    // @todo: throw an exception?
    logger.error(`no template was found for ${filePath}, because .${fileExt} extension is not supported`);
  }
  return template.replace(/{filePath}/g, normalize(filePathWithoutExt));
}

/**
 * The following scenario will help understanding why links are needed.
 * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
 * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
 * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
 * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
 * under 'dependencies' of A.
 */
async function writeDependencyLinks(
  componentDependencies: ComponentWithDependencies[],
  bitMap: BitMap,
  consumerPath: string,
  createNpmLinkFiles: boolean
): Promise<any> {
  const prepareLinkFile = (
    componentId: string,
    mainFile: string,
    linkPath: string,
    relativePathInDependency: string,
    relativePath: Object
  ) => {
    // this is used to converd the component name to a valid npm package  name
    const packagePath = `${getSync(CFG_REGISTRY_DOMAIN_PREFIX) ||
      DEFAULT_REGISTRY_DOMAIN_PREFIX}/${componentId.toStringWithoutVersion().replace(/\//g, '.')}`;
    const rootDir = path.join(consumerPath, bitMap.getRootDirOfComponent(componentId));
    let actualFilePath = path.join(rootDir, relativePathInDependency);
    if (relativePathInDependency === mainFile) {
      actualFilePath = path.join(rootDir, _getIndexFileName(mainFile));
    }
    const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);
    const importSpecifiers = relativePath.importSpecifiers;
    const linkContent = _getLinkContent(relativeFilePath, importSpecifiers, createNpmLinkFiles, packagePath);
    logger.debug(`writeLinkFile, on ${linkPath}`);
    const linkPathExt = getExt(linkPath);
    const isEs6 = importSpecifiers && linkPathExt === 'js';
    return { linkPath, linkContent, isEs6 };
  };

  const componentLink = (
    resolveDepVersion: string,
    relativePath: Object,
    relativePathInDependency: string,
    relativeDistPathInDependency: string,
    relativeDistExtInDependency: string,
    parentDir: string,
    mainFile: string,
    hasDist: boolean
  ) => {
    const sourceRelativePath = relativePath.sourceRelativePath;
    const linkPath = path.join(parentDir, sourceRelativePath);
    let distLinkPath;
    const linkFiles = [];
    if (hasDist) {
      const sourceRelativePathWithCompiledExt = `${getWithoutExt(sourceRelativePath)}.${relativeDistExtInDependency}`;
      distLinkPath = path.join(parentDir, DEFAULT_DIST_DIRNAME, sourceRelativePathWithCompiledExt);
      // Generate a link file inside dist folder of the dependent component
      const linkFile = prepareLinkFile(
        resolveDepVersion,
        mainFile,
        distLinkPath,
        relativeDistPathInDependency,
        relativePath
      );
      linkFiles.push(linkFile);
    }

    const linkFile = prepareLinkFile(resolveDepVersion, mainFile, linkPath, relativePathInDependency, relativePath);
    linkFiles.push(linkFile);
    return linkFiles;
  };

  const componentLinks = (
    // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
    dependencies: Component[],
    directDependencies: Object[],
    flattenedDependencies: BitIds,
    parentDir: string,
    mainFile: string,
    hasDist: boolean
  ) => {
    if (!directDependencies || !directDependencies.length) return [];
    const links = directDependencies.map((dep) => {
      if (!dep.relativePath && (!dep.relativePaths || R.isEmpty(dep.relativePaths))) return [];
      let resolveDepVersion = dep.id;
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        resolveDepVersion = flattenedDependencies.resolveVersion(dep.id).toString();
      }

      // Helper function to look for the component object
      const _byComponentId = dependency => dependency.id.toString() === resolveDepVersion.toString();

      // Get the real dependency component
      const depComponent = R.find(_byComponentId, dependencies);

      const currLinks = dep.relativePaths.map((relativePath) => {
        const destinationRelativePath = relativePath.destinationRelativePath;
        let destinationDistRelativePath = searchFilesIgnoreExt(
          depComponent.dists,
          path.join(DEFAULT_DIST_DIRNAME, destinationRelativePath),
          'relative'
        );
        destinationDistRelativePath = destinationDistRelativePath
          ? destinationDistRelativePath.relative
          : destinationRelativePath;
        const destinationDistRelativePathExt = getExt(destinationDistRelativePath);

        return componentLink(
          resolveDepVersion,
          relativePath,
          destinationRelativePath,
          destinationDistRelativePath,
          destinationDistRelativePathExt,
          parentDir,
          depComponent.calculateMainDistFile(),
          hasDist
        );
      });
      return R.flatten(currLinks);
    });
    const flattenLinks = R.flatten(links);
    const groupLinks = groupBy(flattenLinks, link => link.linkPath);
    const allLinksP = Object.keys(groupLinks).map((group) => {
      let content = '';
      if (groupLinks[group][0].isEs6) {
        // check by the first item of the array, it can be any other item as well
        content = 'Object.defineProperty(exports, "__esModule", { value: true });\n';
      }
      content += groupLinks[group].map(linkItem => linkItem.linkContent).join('\n');
      return outputFile(group, content);
    });

    return Promise.all(allLinksP);
  };

  const allLinksP = componentDependencies.map((componentWithDeps) => {
    const componentMap = bitMap.getComponent(componentWithDeps.component.id, true);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeDependencyLinks, ignoring a component ${componentWithDeps.component.id} as it is an author component`
      );
      return Promise.resolve();
    }
    logger.debug(`writeDependencyLinks, generating links for ${componentWithDeps.component.id}`);
    const directDeps = componentWithDeps.component.dependencies;
    const flattenDeps = componentWithDeps.component.flattenedDependencies;
    const hasDist = componentWithDeps.component.dists && !R.isEmpty(componentWithDeps.component.dists);
    const mainFile = componentWithDeps.component.calculateMainDistFile();
    const directLinksP = componentLinks(
      componentWithDeps.dependencies,
      directDeps,
      flattenDeps,
      componentWithDeps.component.writtenPath,
      mainFile,
      hasDist
    );

    const indirectLinksP = componentWithDeps.dependencies.map((dep: Component) => {
      const depMainFile = dep.calculateMainDistFile();
      const depHasDist = dep.dists && !R.isEmpty(dep.dists);
      // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
      // also the indirect ones
      // The dep.dependencies contain only an id and relativePathes and not the full object
      return componentLinks(
        componentWithDeps.dependencies,
        dep.dependencies,
        dep.flattenedDependencies,
        dep.writtenPath,
        depMainFile,
        depHasDist
      );
    });
    return Promise.all([directLinksP, ...indirectLinksP]);
  });
  return Promise.all(allLinksP);
}

async function writeEntryPointsForImportedComponent(component: Component, bitMap: BitMap): Promise<any> {
  const componentRoot = component.writtenPath;
  const componentId = component.id.toString();
  const componentMap = bitMap.getComponent(componentId);
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return Promise.resolve();
  const mainFile = component.calculateMainDistFile();
  const indexName = _getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = _getLinkContent(`./${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  return outputFile(entryPointPath, AUTO_GENERATED_MSG + entryPointFileContent, false);
}
function generateEntryPointDataForPackages(component: Component): Promise<any> {
  const packagePath = `${component.bindingPrefix}/${component.id.box}/${component.id.name}`;
  const packageName = component.id.toStringWithoutVersion();
  return { packageName, packagePath };
}

export { writeEntryPointsForImportedComponent, writeDependencyLinks, generateEntryPointDataForPackages };
