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
  const componentLink = (
    depId: BitId,
    depComponent: Component,
    relativePath: RelativePath,
    parentComponent: Component,
    parentComponentMap: ComponentMap
  ): LinkFile[] => {
    const getParentDir = (): PathOsBasedAbsolute => {
      // when running from bit build, the writtenPath is not available
      if (!parentComponent.writtenPath) return consumer.toAbsolutePath(parentComponentMap.rootDir);
      if (path.isAbsolute(parentComponent.writtenPath)) return parentComponent.writtenPath;
      return consumer.toAbsolutePath(parentComponent.writtenPath);
    };
    const parentDir = getParentDir();
    const relativePathInDependency = path.normalize(relativePath.destinationRelativePath);
    const mainFile: PathOsBased = depComponent.dists.calculateMainDistFile(depComponent.mainFile);
    const hasDist = parentComponent.dists.writeDistsFiles && !parentComponent.dists.isEmpty();
    const distRoot: PathOsBased = parentComponent.dists.getDistDirForConsumer(consumer, parentComponentMap.rootDir);

    let relativeDistPathInDependency = searchFilesIgnoreExt(
      depComponent.dists.get(),
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
    const depComponentMap = parentComponent.dependenciesSavedAsComponents
      ? consumer.bitMap.getComponent(depId)
      : undefined;

    const depRootDir: ?PathOsBased =
      depComponentMap && depComponentMap.rootDir ? path.join(consumerPath, depComponentMap.rootDir) : undefined;
    const isNpmLink = createNpmLinkFiles || !parentComponent.dependenciesSavedAsComponents;
    const depRootDirDist =
      depComponentMap && depComponentMap.rootDir
        ? depComponent.dists.getDistDirForConsumer(consumer, depComponentMap.rootDir)
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
      } else {
        const sourceRelativePathWithCompiledExt = `${getWithoutExt(sourceRelativePath)}.${relativeDistExtInDependency}`;
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
    }

    const sourceRelativePathWithCompiledExt = `${getWithoutExt(
      relativePathInDependency
    )}.${relativeDistExtInDependency}`;
    const linkFile = prepareLinkFile(
      depId,
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
  };

  const componentLinks = async (
    dependencies: Component[], // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
    parentComponent: Component,
    parentComponentMap: ComponentMap
  ): Promise<Array<{ filePath: string, content: string }>> => {
    const directDependencies: Dependency[] = parentComponent.getAllDependencies();
    const flattenedDependencies: BitIds = parentComponent.getAllFlattenedDependencies();
    if (!directDependencies || !directDependencies.length) return [];
    const links = directDependencies.map((dep: Dependency) => {
      if (!dep.relativePaths || R.isEmpty(dep.relativePaths)) return [];
      let resolveDepVersion = dep.id;
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        resolveDepVersion = flattenedDependencies.resolveVersion(dep.id);
      }

      // Helper function to look for the component object
      const _byComponentId = dependency => dependency.id.toString() === resolveDepVersion.toString();
      // Get the real dependency component
      const depComponent = R.find(_byComponentId, dependencies);

      if (!depComponent) {
        const errorMessage = `link-generation: failed finding ${resolveDepVersion.toString()} in the dependencies array of ${
          parentComponent.id
        }.
The dependencies array has the following ids: ${dependencies.map(d => d.id).join(', ')}`;
        throw new GeneralError(errorMessage);
      }

      const currLinks = dep.relativePaths.map((relativePath: RelativePath) => {
        return componentLink(resolveDepVersion, depComponent, relativePath, parentComponent, parentComponentMap);
      });
      return R.flatten(currLinks);
    });
    const internalCustomResolvedLinks = parentComponent.customResolvedPaths.length
      ? getInternalCustomResolvedLinks(parentComponent, createNpmLinkFiles)
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
      await generatePostInstallScript(parentComponent, postInstallLinks);
    }
    return linksToWrite;
  };

  const allLinksP = componentDependencies.map(async (componentWithDeps: ComponentWithDependencies) => {
    const componentMap = consumer.bitMap.getComponent(componentWithDeps.component.id);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeDependencyLinks, ignoring a component ${componentWithDeps.component.id} as it is an author component`
      );
      return null;
    }
    // it must be IMPORTED. We don't pass NESTED to this function
    logger.debug(`writeDependencyLinks, generating links for ${componentWithDeps.component.id}`);
    componentWithDeps.component.stripOriginallySharedDir(consumer.bitMap);

    const directLinks = await componentLinks(
      componentWithDeps.allDependencies,
      componentWithDeps.component,
      componentMap
    );

    if (componentWithDeps.component.dependenciesSavedAsComponents) {
      const indirectLinks = await Promise.all(
        componentWithDeps.allDependencies.map((dep: Component) => {
          const depComponentMap = consumer.bitMap.getComponent(dep.id);
          // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
          // also the indirect ones
          // The dep.dependencies contain only an id and relativePaths and not the full object
          return componentLinks(componentWithDeps.allDependencies, dep, depComponentMap);
        })
      );
      return [directLinks, ...indirectLinks];
    }
    return directLinks;
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

export { writeEntryPointsForComponent, writeDependencyLinks, getLinkContent, getIndexFileName };
