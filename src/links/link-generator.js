// @flow
import fs from 'fs-extra';
import path from 'path';
import normalize from 'normalize-path';
import R from 'ramda';
import uniqBy from 'lodash.uniqby';
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
import type { RelativePath } from '../consumer/component/dependencies/dependency';
import { BitIds, BitId } from '../bit-id';
import fileTypesPlugins from '../plugins/file-types-plugins';
import { getSync } from '../api/consumer/lib/global-config';
import { Consumer } from '../consumer';
import ComponentMap from '../consumer/bit-map/component-map';
import type { PathOsBased, PathOsBasedAbsolute } from '../utils/path';
import GeneralError from '../error/general-error';
import postInstallTemplate from '../consumer/component/templates/postinstall.default-template';
import Dependencies from '../consumer/component/dependencies/dependencies';

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

type LinkFile = { linkPath: string, linkContent: string, isEs6: boolean, postInstallLink?: boolean };

// todo: move to bit-javascript
function getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}.${getExt(mainFile)}`;
}

// todo: move to bit-javascript
function getLinkContent(
  filePath: PathOsBased,
  importSpecifiers?: Object,
  createNpmLinkFiles?: boolean,
  bitPackageName?: string
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
    throw new GeneralError(`no template was found for ${filePath}, because .${fileExt} extension is not supported`);
  }
  return template.replace(/{filePath}/g, normalize(filePathWithoutExt));
}

function prepareLinkFile(
  componentId: BitId,
  mainFile: PathOsBased,
  linkPath: string,
  relativePathInDependency: PathOsBased,
  relativePath: Object,
  depRootDir: ?PathOsBased,
  isNpmLink: boolean
): LinkFile {
  // this is used to convert the component name to a valid npm package  name
  const packagePath = `${getSync(CFG_REGISTRY_DOMAIN_PREFIX) ||
    DEFAULT_REGISTRY_DOMAIN_PREFIX}/${componentId.toStringWithoutVersion().replace(/\//g, '.')}`;
  let actualFilePath = depRootDir ? path.join(depRootDir, relativePathInDependency) : relativePathInDependency;
  if (relativePathInDependency === mainFile) {
    actualFilePath = depRootDir ? path.join(depRootDir, mainFile) : mainFile;
  }
  const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);
  const importSpecifiers = relativePath.importSpecifiers;
  const linkContent = getLinkContent(relativeFilePath, importSpecifiers, isNpmLink, packagePath);
  logger.debug(`prepareLinkFile, on ${linkPath}`);
  const linkPathExt = getExt(linkPath);
  const isEs6 = importSpecifiers && linkPathExt === 'js';
  return { linkPath, linkContent, isEs6 };
}

/**
 * a dependency component may have multiple files required by the main component.
 * this function returns the link content of one file of a dependency.
 * @see RelativePath docs for more info
 */
function _getLinksForOneDependencyFile({
  consumer,
  component,
  componentMap,
  relativePath,
  dependencyId,
  dependencyComponent,
  createNpmLinkFiles,
  targetDir
}: {
  consumer: Consumer,
  component: Component,
  componentMap: ComponentMap,
  relativePath: RelativePath,
  dependencyId: BitId,
  dependencyComponent: Component,
  createNpmLinkFiles: boolean,
  targetDir?: string
}): LinkFile[] {
  const consumerPath: PathOsBased = consumer.getPath();
  const getTargetDir = (): PathOsBasedAbsolute => {
    if (targetDir) return targetDir;
    // when running from bit build, the writtenPath is not available
    if (!component.writtenPath) return consumer.toAbsolutePath(componentMap.rootDir);
    if (path.isAbsolute(component.writtenPath)) return component.writtenPath;
    return consumer.toAbsolutePath(component.writtenPath);
  };
  const parentDir = getTargetDir();
  const relativePathInDependency = path.normalize(relativePath.destinationRelativePath);
  const mainFile: PathOsBased = dependencyComponent.dists.calculateMainDistFile(dependencyComponent.mainFile);
  const hasDist = component.dists.writeDistsFiles && !component.dists.isEmpty();
  const distRoot: PathOsBased = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);

  let relativeDistPathInDependency = searchFilesIgnoreExt(
    dependencyComponent.dists.get(),
    relativePathInDependency,
    'relative'
  );
  relativeDistPathInDependency = relativeDistPathInDependency // $FlowFixMe relative is defined
    ? relativeDistPathInDependency.relative
    : relativePathInDependency;

  const relativeDistExtInDependency = getExt(relativeDistPathInDependency);
  const sourceRelativePath = relativePath.sourceRelativePath;
  const getLinkPath = () => {
    if (!relativePath.isCustomResolveUsed) return path.join(parentDir, sourceRelativePath);
    // $FlowFixMe relativePath.importSource is set when isCustomResolveUsed
    const importSource: string = relativePath.importSource;
    const importSourceFileExt = relativeDistExtInDependency || path.extname(relativePath.sourceRelativePath);
    // e.g. for require('utils/is-string'), the link should be at node_modules/utils/is-string/index.js
    const importSourceFile = path.extname(importSource)
      ? importSource
      : path.join(importSource, `${DEFAULT_INDEX_NAME}.${importSourceFileExt}`);
    const importSourcePath = path.join('node_modules', importSourceFile);
    // if createNpmLinkFiles, the path will be part of the postinstall script, so it shouldn't be absolute
    return createNpmLinkFiles ? importSourcePath : path.join(parentDir, importSourcePath);
  };
  const linkPath = getLinkPath();

  let distLinkPath: PathOsBased;
  const linkFiles = [];
  const depComponentMap = component.dependenciesSavedAsComponents
    ? consumer.bitMap.getComponent(dependencyId)
    : undefined;

  const depRootDir: ?PathOsBased =
    depComponentMap && depComponentMap.rootDir ? path.join(consumerPath, depComponentMap.rootDir) : undefined;
  const isNpmLink = createNpmLinkFiles || !component.dependenciesSavedAsComponents;
  const depRootDirDist =
    depComponentMap && depComponentMap.rootDir
      ? dependencyComponent.dists.getDistDirForConsumer(consumer, depComponentMap.rootDir)
      : undefined;

  if (hasDist) {
    if (relativePath.isCustomResolveUsed) {
      if (!consumer.shouldDistsBeInsideTheComponent()) {
        // when isCustomResolvedUsed, the link is generated inside node_module directory, so for
        // dist inside the component, only one link is needed at the parentRootDir. for dist
        // outside the component dir, another link is needed for the dist/parentRootDir.
        // $FlowFixMe relativePath.importSource is set when isCustomResolveUsed
        distLinkPath = path.join(distRoot, 'node_modules', relativePath.importSource);
        const linkFile = prepareLinkFile(
          dependencyId,
          mainFile,
          distLinkPath,
          relativeDistPathInDependency,
          relativePath,
          depRootDirDist,
          isNpmLink
        );
        linkFiles.push(linkFile);
      }
    } else {
      const sourceRelativePathWithCompiledExt = `${getWithoutExt(sourceRelativePath)}.${relativeDistExtInDependency}`;
      distLinkPath = path.join(distRoot, sourceRelativePathWithCompiledExt);
      // Generate a link file inside dist folder of the dependent component
      const linkFile = prepareLinkFile(
        dependencyId,
        mainFile,
        distLinkPath,
        relativeDistPathInDependency,
        relativePath,
        depRootDirDist,
        isNpmLink
      );
      linkFiles.push(linkFile);
    }
  }

  const sourceRelativePathWithCompiledExt = `${getWithoutExt(relativePathInDependency)}.${relativeDistExtInDependency}`;
  const linkFile = prepareLinkFile(
    dependencyId,
    mainFile,
    linkPath,
    relativePath.isCustomResolveUsed && depRootDirDist && consumer.shouldDistsBeInsideTheComponent() && hasDist
      ? sourceRelativePathWithCompiledExt
      : relativePathInDependency,
    relativePath,
    relativePath.isCustomResolveUsed && depRootDirDist && consumer.shouldDistsBeInsideTheComponent() && hasDist
      ? depRootDirDist
      : depRootDir,
    isNpmLink
  );
  if (relativePath.isCustomResolveUsed && createNpmLinkFiles) {
    linkFile.postInstallLink = true;
  }

  linkFiles.push(linkFile);
  return linkFiles;
}

/**
 * a component may have many dependencies, this function returns the links content for all of its dependencies
 */
async function getComponentLinks({
  consumer,
  component,
  componentMap,
  dependencies,
  createNpmLinkFiles
}: {
  consumer: Consumer,
  component: Component,
  componentMap: ComponentMap,
  dependencies: Component[], // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
  createNpmLinkFiles: boolean
}): Promise<Array<{ filePath: string, content: string }>> {
  const directDependencies: Dependency[] = component.getAllDependencies();
  const flattenedDependencies: BitIds = component.getAllFlattenedDependencies();
  if (!directDependencies || !directDependencies.length) return [];
  const links = directDependencies.map((dep: Dependency) => {
    if (!dep.relativePaths || R.isEmpty(dep.relativePaths)) return [];
    const getDependencyIdWithResolvedVersion = (): BitId => {
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        return flattenedDependencies.resolveVersion(dep.id);
      }
      return dep.id;
    };
    const dependencyId = getDependencyIdWithResolvedVersion();
    // Get the real dependency component
    const dependencyComponent = dependencies.find(dependency => dependency.id.isEqual(dependencyId));

    if (!dependencyComponent) {
      const errorMessage = `link-generation: failed finding ${dependencyId.toString()} in the dependencies array of ${
        component.id
      }.
The dependencies array has the following ids: ${dependencies.map(d => d.id).join(', ')}`;
      throw new GeneralError(errorMessage);
    }

    const dependencyLinks = dep.relativePaths.map((relativePath: RelativePath) => {
      return _getLinksForOneDependencyFile({
        consumer,
        component,
        componentMap,
        relativePath,
        dependencyId,
        dependencyComponent,
        createNpmLinkFiles
      });
    });
    return R.flatten(dependencyLinks);
  });
  const internalCustomResolvedLinks = component.customResolvedPaths.length
    ? getInternalCustomResolvedLinks(component, createNpmLinkFiles)
    : [];
  const flattenLinks = R.flatten(links).concat(internalCustomResolvedLinks);

  const groupLinks = groupBy(flattenLinks, link => link.linkPath);
  const linksToWrite = [];
  const postInstallLinks = [];
  Object.keys(groupLinks).forEach((group) => {
    let content = '';
    const firstGroupItem = groupLinks[group][0];
    if (firstGroupItem.isEs6) {
      // check by the first item of the array, it can be any other item as well
      content = 'Object.defineProperty(exports, "__esModule", { value: true });\n';
    }
    content += groupLinks[group].map(linkItem => linkItem.linkContent).join('\n');
    const linkFile = { filePath: group, content };
    if (firstGroupItem.postInstallLink) postInstallLinks.push(linkFile);
    else linksToWrite.push(linkFile);
  });
  if (postInstallLinks.length) {
    await generatePostInstallScript(component, postInstallLinks);
  }
  return linksToWrite;
}

/**
 * The following scenario will help understanding why links are needed.
 * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
 * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
 * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
 * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
 * under 'dependencies' of A.
 *
 * It does the link generation in two steps.
 * step 1: "componentsLinks", it generates links to all imported components.
 * target: imported components. source: dependencies.
 * step 2: "dependenciesLinks", it generates links to all dependencies of the imported components.
 * target: dependencies. source: other dependencies.
 * this step is not needed when the imported components don't have dependencies, or when the
 * dependencies were installed as npm/yarn packages.
 */
async function writeComponentsDependenciesLinks(
  componentDependencies: ComponentWithDependencies[],
  consumer: Consumer,
  createNpmLinkFiles: boolean
): Promise<any> {
  const allLinksP = componentDependencies.map(async (componentWithDeps: ComponentWithDependencies) => {
    const componentMap = consumer.bitMap.getComponent(componentWithDeps.component.id);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeComponentsDependenciesLinks, ignoring a component ${
          componentWithDeps.component.id
        } as it is an author component`
      );
      return null;
    }
    // it must be IMPORTED. We don't pass NESTED to this function
    logger.debug(`writeComponentsDependenciesLinks, generating links for ${componentWithDeps.component.id}`);
    componentWithDeps.component.stripOriginallySharedDir(consumer.bitMap);

    const componentsLinks = await getComponentLinks({
      consumer,
      component: componentWithDeps.component,
      componentMap,
      dependencies: componentWithDeps.allDependencies,
      createNpmLinkFiles
    });

    if (componentWithDeps.component.dependenciesSavedAsComponents) {
      const dependenciesLinks = await Promise.all(
        componentWithDeps.allDependencies.map((dep: Component) => {
          const depComponentMap = consumer.bitMap.getComponent(dep.id);
          // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
          // also the indirect ones
          // The dep.dependencies contain only an id and relativePaths and not the full object
          return getComponentLinks({
            consumer,
            component: dep,
            componentMap: depComponentMap,
            dependencies: componentWithDeps.allDependencies,
            createNpmLinkFiles
          });
        })
      );
      return [componentsLinks, ...dependenciesLinks];
    }
    return componentsLinks;
  });
  const allLinks = await Promise.all(allLinksP);

  const linksWithoutNulls = R.flatten(allLinks).filter(x => x);
  const linksWithoutDuplications = uniqBy(linksWithoutNulls, 'filePath');
  return Promise.all(linksWithoutDuplications.map(link => outputFile(link)));
}

/**
 * when using custom module resolutions, and inside a component there is a file that requires
 * another file by custom-resolved syntax, we must generate links on the imported component inside
 * node_modules.
 *
 * E.g. original component "utils/jump" has two files:
 * bar/foo.js => require('utils/is-string); // "src" is set to be a module-directory
 * utils/is-string.js
 *
 * imported component:
 * components/utils/jump/bar/foo.js
 * components/utils/jump/utils/is-string.js
 * components/utils/jump/node_modules/utils/is-string // this is the file we generate here
 */
function getInternalCustomResolvedLinks(component: Component, createNpmLinkFiles: boolean): LinkFile[] {
  const componentDir = component.writtenPath;
  const getDestination = (importSource: string) => `node_modules/${importSource}`;
  return component.customResolvedPaths.map((customPath) => {
    const sourceAbs = path.join(componentDir, customPath.destinationPath);
    const dest = getDestination(customPath.importSource);
    const destAbs = path.join(componentDir, dest);
    const destRelative = path.relative(path.dirname(destAbs), sourceAbs);
    const linkContent = getLinkContent(destRelative);
    return { linkPath: createNpmLinkFiles ? dest : destAbs, linkContent, postInstallLink: createNpmLinkFiles };
  });
}

async function generatePostInstallScript(component: Component, postInstallLinks) {
  const componentDir = component.writtenPath;
  // convert from array to object for easier parsing in the postinstall script
  const linkPathsObject = postInstallLinks.reduce((acc, val) => {
    acc[val.filePath] = val.content;
    return acc;
  }, {});
  if (!component.packageJsonInstance) throw new Error(`packageJsonInstance is missing for ${component.id.toString()}`);
  const postInstallCode = postInstallTemplate(JSON.stringify(linkPathsObject));
  const POST_INSTALL_FILENAME = '.bit.postinstall.js';
  const postInstallFilePath = path.join(componentDir, POST_INSTALL_FILENAME);
  // await fs.writeFile(postInstallFilePath, postInstallCode);
  const postInstallScript = `node ${POST_INSTALL_FILENAME}`;
  component.packageJsonInstance.scripts = { postinstall: postInstallScript };
  const override = true;
  await Promise.all([
    fs.writeFile(postInstallFilePath, postInstallCode),
    component.packageJsonInstance.write({ override })
  ]);
}

/**
 * Relevant for IMPORTED and NESTED only
 */
async function writeEntryPointsForComponent(component: Component, consumer: Consumer): Promise<any> {
  const componentMap = consumer.bitMap.getComponent(component.id);
  const componentRoot = component.writtenPath || componentMap.rootDir;
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return Promise.resolve();
  const mainFile = component.dists.calculateMainDistFile(component.mainFile);
  const indexName = getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = getLinkContent(`./${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  if (!component.dists.isEmpty() && component.dists.writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
    const distDir = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
    const entryPointDist = path.join(distDir, indexName);
    logger.debug(`writeEntryPointFile, on ${entryPointDist}`);
    await outputFile({ filePath: entryPointDist, content: entryPointFileContent, override: false });
  }
  logger.debug(`writeEntryPointFile, on ${entryPointPath}`);
  return outputFile({ filePath: entryPointPath, content: entryPointFileContent, override: false });
}

/**
 * used for writing compiler and tester dependencies to the directory of their configuration file
 * the configuration directory is not always the same as the component, it can be moved by 'eject-conf' command
 * this methods write the environment dependency links no matter where the directory located on the workspace
 *
 */
async function writeDependenciesLinksToDir(
  targetDir: PathOsBased,
  component: Component,
  dependencies: Dependencies,
  consumer: Consumer
) {
  const linksP = dependencies.get().map(async (dependency: Dependency) => {
    const dependencyComponent = await consumer.scope.getConsumerComponent(dependency.id);
    const dependencyLinks = dependency.relativePaths.map((relativePath: RelativePath) => {
      return _getLinksForOneDependencyFile({
        consumer,
        component,
        componentMap: component.componentMap,
        relativePath,
        dependencyId: dependency.id,
        dependencyComponent,
        createNpmLinkFiles: false,
        targetDir
      });
    });
    return R.flatten(dependencyLinks);
  });
  const links = await Promise.all(linksP);

  return Promise.all(R.flatten(links).map(link => outputFile({ filePath: link.linkPath, content: link.linkContent })));
}

export {
  writeEntryPointsForComponent,
  writeComponentsDependenciesLinks,
  getLinkContent,
  getIndexFileName,
  writeDependenciesLinksToDir
};
