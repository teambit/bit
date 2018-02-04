// @flow
import path from 'path';
import normalize from 'normalize-path';
import R from 'ramda';
import groupBy from 'lodash.groupby';
import {
  DEFAULT_INDEX_NAME,
  COMPONENT_ORIGINS,
  CFG_REGISTRY_DOMAIN_PREFIX,
  DEFAULT_REGISTRY_DOMAIN_PREFIX
} from '../constants';
import { outputFile, getWithoutExt, searchFilesIgnoreExt, getExt } from '../utils';
import logger from '../logger/logger';
import { ComponentWithDependencies } from '../scope';
import Component from '../consumer/component';
import { Dependency } from '../consumer/component/dependencies';
import { RelativePath } from '../consumer/component/dependencies/dependency';
import { BitIds } from '../bit-id';
import fileTypesPlugins from '../plugins/file-types-plugins';
import { getSync } from '../api/consumer/lib/global-config';
import { Consumer } from '../consumer';
import ComponentMap from '../consumer/bit-map/component-map';
import type { PathOsBased } from '../utils/path';

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
function getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}.${getExt(mainFile)}`;
}

// todo: move to bit-javascript
function getLinkContent(
  filePath: PathOsBased,
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
  consumer: Consumer,
  createNpmLinkFiles: boolean
): Promise<any> {
  const consumerPath: PathOsBased = consumer.getPath();
  const prepareLinkFile = (
    componentId: string,
    mainFile: PathOsBased,
    linkPath: string,
    relativePathInDependency: PathOsBased,
    relativePath: Object,
    depRootDir: ?PathOsBased,
    isNpmLink: boolean
  ) => {
    // this is used to convert the component name to a valid npm package  name
    const packagePath = `${getSync(CFG_REGISTRY_DOMAIN_PREFIX) ||
      DEFAULT_REGISTRY_DOMAIN_PREFIX}/${componentId.toStringWithoutVersion().replace(/\//g, '.')}`;
    let actualFilePath = depRootDir ? path.join(depRootDir, relativePathInDependency) : relativePathInDependency;
    if (relativePathInDependency === mainFile) {
      actualFilePath = depRootDir ? path.join(depRootDir, getIndexFileName(mainFile)) : getIndexFileName(mainFile);
    }
    const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);
    const importSpecifiers = relativePath.importSpecifiers;
    const linkContent = getLinkContent(relativeFilePath, importSpecifiers, isNpmLink, packagePath);
    logger.debug(`writeLinkFile, on ${linkPath}`);
    const linkPathExt = getExt(linkPath);
    const isEs6 = importSpecifiers && linkPathExt === 'js';
    return { linkPath, linkContent, isEs6 };
  };

  const componentLink = (
    depId: string,
    depComponent: Component,
    relativePath: RelativePath,
    parentComponent: Component,
    parentComponentMap: ComponentMap
  ) => {
    const parentDir = parentComponent.writtenPath || parentComponentMap.rootDir; // when running from bit build, the writtenPath is not available
    const relativePathInDependency = path.normalize(relativePath.destinationRelativePath);
    const mainFile: PathOsBased = depComponent.calculateMainDistFile();
    const hasDist = parentComponent._writeDistsFiles && parentComponent.dists && !R.isEmpty(parentComponent.dists);
    const distRoot: PathOsBased = parentComponent.getDistDirForConsumer(consumer, parentComponentMap.rootDir);

    let relativeDistPathInDependency = searchFilesIgnoreExt(depComponent.dists, relativePathInDependency, 'relative');
    relativeDistPathInDependency = relativeDistPathInDependency
      ? relativeDistPathInDependency.relative
      : relativePathInDependency;

    const relativeDistExtInDependency = getExt(relativeDistPathInDependency);
    const sourceRelativePath = relativePath.sourceRelativePath;
    const linkPath = path.join(parentDir, sourceRelativePath);
    let distLinkPath: PathOsBased;
    const linkFiles = [];
    const depComponentMap = parentComponent.dependenciesSavedAsComponents
      ? consumer.bitMap.getComponent(depId, true)
      : undefined;

    const depRootDir: ?PathOsBased = depComponentMap ? path.join(consumerPath, depComponentMap.rootDir) : undefined;
    const isNpmLink = createNpmLinkFiles || !parentComponent.dependenciesSavedAsComponents;
    if (hasDist) {
      const sourceRelativePathWithCompiledExt = `${getWithoutExt(sourceRelativePath)}.${relativeDistExtInDependency}`;
      const depRootDirDist = depComponentMap
        ? depComponent.getDistDirForConsumer(consumer, depComponentMap.rootDir)
        : undefined;
      distLinkPath = path.join(distRoot, sourceRelativePathWithCompiledExt);
      // Generate a link file inside dist folder of the dependent component
      const linkFile = prepareLinkFile(
        depId,
        mainFile,
        distLinkPath,
        relativeDistPathInDependency,
        relativePath,
        depRootDirDist,
        isNpmLink
      );
      linkFiles.push(linkFile);
    }

    const linkFile = prepareLinkFile(
      depId,
      mainFile,
      linkPath,
      relativePathInDependency,
      relativePath,
      depRootDir,
      isNpmLink
    );
    linkFiles.push(linkFile);
    return linkFiles;
  };

  const componentLinks = (
    dependencies: Component[], // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
    parentComponent: Component,
    parentComponentMap: ComponentMap
  ) => {
    const directDependencies: Dependency[] = parentComponent.getAllDependencies();
    const flattenedDependencies: BitIds = parentComponent.getAllFlattenedDependencies();
    if (!directDependencies || !directDependencies.length) return [];
    const links = directDependencies.map((dep: Dependency) => {
      if (!dep.relativePaths || R.isEmpty(dep.relativePaths)) return [];
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

      const currLinks = dep.relativePaths.map((relativePath: RelativePath) => {
        return componentLink(resolveDepVersion, depComponent, relativePath, parentComponent, parentComponentMap);
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
      return outputFile({ filePath: group, content });
    });

    return Promise.all(allLinksP);
  };

  const allLinksP = componentDependencies.map((componentWithDeps: ComponentWithDependencies) => {
    const componentMap = consumer.bitMap.getComponent(componentWithDeps.component.id, true);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeDependencyLinks, ignoring a component ${componentWithDeps.component.id} as it is an author component`
      );
      return Promise.resolve();
    }
    // it must be IMPORTED. We don't pass NESTED to this function
    logger.debug(`writeDependencyLinks, generating links for ${componentWithDeps.component.id}`);
    componentWithDeps.component.stripOriginallySharedDir(consumer.bitMap);

    const directLinksP = componentLinks(componentWithDeps.allDependencies, componentWithDeps.component, componentMap);

    if (componentWithDeps.component.dependenciesSavedAsComponents) {
      const indirectLinksP = componentWithDeps.allDependencies.map((dep: Component) => {
        const depComponentMap = consumer.bitMap.getComponent(dep.id, true);
        // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
        // also the indirect ones
        // The dep.dependencies contain only an id and relativePaths and not the full object
        return componentLinks(componentWithDeps.allDependencies, dep, depComponentMap);
      });
      return Promise.all([directLinksP, ...indirectLinksP]);
    }
    return directLinksP;
  });
  return Promise.all(allLinksP);
}

/**
 * Relevant for IMPORTED and NESTED only
 */
async function writeEntryPointsForComponent(component: Component, consumer: Consumer): Promise<any> {
  const componentId = component.id.toString();
  const componentMap = consumer.bitMap.getComponent(componentId);
  const componentRoot = component.writtenPath || componentMap.rootDir;
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return Promise.resolve();
  const mainFile = component.calculateMainDistFile();
  const indexName = getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = getLinkContent(`./${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  if (component.dists && component._writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
    const distDir = component.getDistDirForConsumer(consumer, componentMap.rootDir);
    const entryPointDist = path.join(distDir, indexName);
    logger.debug(`writeEntryPointFile, on ${entryPointDist}`);
    await outputFile({ filePath: entryPointDist, content: entryPointFileContent, override: false });
  }
  logger.debug(`writeEntryPointFile, on ${entryPointPath}`);
  return outputFile({ filePath: entryPointPath, content: entryPointFileContent, override: false });
}

export { writeEntryPointsForComponent, writeDependencyLinks, getLinkContent, getIndexFileName };
