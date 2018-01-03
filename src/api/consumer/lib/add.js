/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import format from 'string-format';
import assignwith from 'lodash.assignwith';
import groupby from 'lodash.groupby';
import unionBy from 'lodash.unionby';
import find from 'lodash.find';
import clone from 'clone';

import {
  glob,
  isDir,
  calculateFileInfo,
  existsSync,
  pathNormalizeToLinux,
  pathResolve,
  getMissingTestFiles,
  retrieveIgnoreList,
  pathIsInside
} from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS, REGEX_PATTERN, AUTO_GENERATED_STAMP } from '../../../constants';
import logger from '../../../logger/logger';
import PathNotExists from './exceptions/path-not-exists';
import MissingComponentIdForImportedComponent from './exceptions/missing-id-imported-component';
import IncorrectIdForImportedComponent from './exceptions/incorrect-id-imported-component';
import NoFiles from './exceptions/no-files';
import DuplicateIds from './exceptions/duplicate-ids';
import arrayDiff from 'array-difference';
import EmptyDirectory from './exceptions/empty-directory';
import type { ComponentMapFile } from '../../../consumer/bit-map/component-map';

export default (async function addAction(
  componentPaths: string[],
  id?: string,
  main?: string,
  namespace: ?string,
  tests?: string[],
  exclude?: string[],
  override: boolean
): Promise<Object> {
  /**
   * Add or update existing(imported and new) components according to bitmap
   *
   * @param {string} consumerPath - consumer path
   * @param {BitMap} bitmap consumer bitMap
   * @param {Object} component - component to add
   * @returns {ComponentMap[]} componentMap
   */
  const addOrUpdateExistingComponentsInBitMap = (
    consumerPath: String,
    bitmap: BitMap,
    component: Object
  ): componentMaps[] => {
    const componentsObject = {};
    component.files.forEach((file) => {
      const fileContent = fs.readFileSync(path.join(consumerPath, file.relativePath)).toString();
      if (!fileContent.includes(AUTO_GENERATED_STAMP)) {
        const foundComponentFromBitMap = bitmap.getComponentObjectOfFileByPath(file.relativePath);
        const bitMapComponentId = !R.isEmpty(foundComponentFromBitMap)
          ? Object.keys(foundComponentFromBitMap)[0]
          : null;
        if (bitMapComponentId && foundComponentFromBitMap[bitMapComponentId].rootDir) {
          const parsedBitId = BitId.parse(bitMapComponentId);
          // throw error in case user didnt add id to imported component or the id is incorrect
          if (!id) throw new MissingComponentIdForImportedComponent(parsedBitId.toStringWithoutVersion());
          if (bitMapComponentId !== id) {
            throw new IncorrectIdForImportedComponent(parsedBitId.toStringWithoutVersion(), id);
          }

          const potentialComponent = clone(foundComponentFromBitMap[bitMapComponentId]);
          const tempFile = path.relative(potentialComponent.rootDir, file.relativePath);
          const foundFile = find(potentialComponent.files, x => x.relativePath === tempFile);
          potentialComponent.files = [];

          if (!componentsObject[bitMapComponentId]) {
            !foundFile
              ? (potentialComponent.files = [file])
              : (foundFile.relativePath = path.join(potentialComponent.rootDir, foundFile.relativePath));
            componentsObject[bitMapComponentId] = potentialComponent;
          } else {
            !foundFile
              ? componentsObject[bitMapComponentId].files.push(file)
              : (foundFile.relativePath = path.join(potentialComponent.rootDir, foundFile.relativePath));
          }
        } else {
          // component not imported then add it as a seperated component
          const temp = clone(component);
          temp.files = [file];
          componentsObject[temp.componentId]
            ? componentsObject[temp.componentId].files.push(file)
            : (componentsObject[temp.componentId] = temp);
        }
      }
    });
    return Object.keys(componentsObject).map((key) => {
      componentsObject[key].componentId = BitId.parse(key);
      return addToBitMap(bitMap, componentsObject[key]);
    });
  };
  // used to validate that no two files where added with the same id in the same bit add command
  const validateNoDuplicateIds = (addComponents: Object[]) => {
    const duplicateIds = {};
    const newGroupedComponents = groupby(addComponents, 'componentId');
    Object.keys(newGroupedComponents).forEach(
      key => (newGroupedComponents[key].length > 1 ? (duplicateIds[key] = newGroupedComponents[key]) : '')
    );
    if (!R.isEmpty(duplicateIds) && !R.isNil(duplicateIds)) throw new DuplicateIds(duplicateIds);
  };
  const addToBitMap = (bitmap: BitMap, { componentId, files, mainFile }): { id: string, files: string[] } => {
    bitMap.addComponent({
      componentId,
      files,
      mainFile,
      origin: COMPONENT_ORIGINS.AUTHORED,
      override
    });
    return { id: componentId.toString(), files: bitMap.getComponent(componentId).files };
  };

  function getPathRelativeToProjectRoot(componentPath, projectRoot) {
    if (!componentPath) return componentPath;
    const absPath = path.resolve(componentPath);
    return path.relative(projectRoot, absPath);
  }

  // update test files according to dsl
  async function getFiles(files: string[], testFiles: string[]): string[] {
    const fileList = testFiles.map(async (dsl) => {
      const fileList = files.map(async (file) => {
        const fileInfo = calculateFileInfo(file);
        const generatedFile = format(dsl, fileInfo);
        const matches = await glob(generatedFile, { ignore: ignoreList });
        return matches.filter(match => fs.existsSync(match));
      });
      return Promise.all(fileList);
    });
    const fileListRes = R.flatten(await Promise.all(fileList));
    const uniq = R.uniq(fileListRes);
    return uniq.map((testFile) => {
      const relativeToConsumer = getPathRelativeToProjectRoot(testFile, consumer.getPath());
      return pathNormalizeToLinux(relativeToConsumer);
    });
  }

  async function addOneComponent(
    componentPathsStats: Object,
    bitMap: BitMap,
    consumer: Consumer,
    gitIgnoreFiles: string[]
  ) {
    // remove excluded files from file list
    async function removeExcludedFiles(mapValues, excludedList) {
      const files = R.flatten(mapValues.map(x => x.files.map(i => i.relativePath)));
      const resolvedExcludedFiles = await getFiles(files, excludedList);
      mapValues.forEach((mapVal) => {
        const mainFile = pathNormalizeToLinux(mapVal.mainFile);
        if (resolvedExcludedFiles.includes(mainFile)) {
          mapVal.files = [];
        } else mapVal.files = mapVal.files.filter(key => !resolvedExcludedFiles.includes(key.relativePath)); // if mainFile is excluded, exclude all files
      });
    }

    // used for updating main file if exists or doesn't exists
    function addMainFileToFiles(files: ComponentMapFile[], mainFile) {
      if (mainFile && mainFile.match(REGEX_PATTERN)) {
        files.forEach((file) => {
          const fileInfo = calculateFileInfo(file.relativePath);
          const generatedFile = format(mainFile, fileInfo);
          const foundFile = R.find(R.propEq('relativePath', generatedFile))(files);
          if (foundFile) {
            mainFile = foundFile.relativePath;
          }
          if (fs.existsSync(generatedFile) && !foundFile) {
            files.push({ relativePath: generatedFile, test: false, name: path.basename(generatedFile) });
            mainFile = generatedFile;
          }
        });
      }
      let resolvedMainFile;
      if (mainFile) {
        const mainPath = path.join(consumer.getPath(), consumer.getPathRelativeToConsumer(mainFile));
        if (fs.existsSync(mainPath)) {
          resolvedMainFile = consumer.getPathRelativeToConsumer(mainPath);
        } else {
          resolvedMainFile = mainFile;
        }
      }
      mainFile = resolvedMainFile;
      return resolvedMainFile;
    }

    let componentExists = false;
    let parsedId: BitId;
    const updateIdAccordingToExistingComponent = (currentId) => {
      const existingComponentId = bitMap.getExistingComponentId(currentId);
      componentExists = !!existingComponentId;
      if (componentExists && bitMap.getComponent(existingComponentId).origin === COMPONENT_ORIGINS.NESTED) {
        throw new Error(`One of your dependencies (${existingComponentId}) has already the same namespace and name. 
      If you're trying to add a new component, please choose a new namespace or name.
      If you're trying to update a dependency component, please re-import it individually`);
      }

      if (componentExists) id = existingComponentId;
      parsedId = existingComponentId ? BitId.parse(existingComponentId) : BitId.parse(currentId);
    };

    if (id) {
      updateIdAccordingToExistingComponent(id);
    }

    async function mergeTestFilesWithFiles(files: ComponentMapFile[]): ComponentMapFile[] {
      const testFilesArr = !R.isEmpty(tests) ? await getFiles(files.map(file => file.relativePath), tests) : [];
      const resolvedTestFiles = testFilesArr.map(testFile => ({
        relativePath: testFile,
        test: true,
        name: path.basename(testFile)
      }));

      return unionBy(resolvedTestFiles, files, 'relativePath');
    }

    const mapValuesP = await Object.keys(componentPathsStats).map(async (componentPath) => {
      if (componentPathsStats[componentPath].isDir) {
        const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
        const absoluteComponentPath = pathResolve(componentPath, false);
        const splitPath = absoluteComponentPath.split(path.sep);
        const lastDir = splitPath[splitPath.length - 1];
        const nameSpaceOrDir = namespace || splitPath[splitPath.length - 2];

        const matches = await glob(path.join(relativeComponentPath, '**'), {
          cwd: consumer.getPath(),
          nodir: true,
          ignore: gitIgnoreFiles
        });

        if (!matches.length) throw new EmptyDirectory();

        let files = matches.map((match) => {
          return { relativePath: pathNormalizeToLinux(match), test: false, name: path.basename(match) };
        });

        // merge test files with files
        files = await mergeTestFilesWithFiles(files);
        const resolvedMainFile = addMainFileToFiles(files, pathNormalizeToLinux(main));
        // matches.forEach((match) => {
        //   if (keepDirectoryName) {
        //     files[match] = match;
        //   } else {
        //     const stripMainDir = match.replace(`${relativeComponentPath}${path.sep}`, '');
        //     files[stripMainDir] = match;
        //   }
        // });

        if (!parsedId) {
          parsedId = BitId.getValidBitId(nameSpaceOrDir, lastDir);
        }

        return { componentId: parsedId, files, mainFile: resolvedMainFile };
      }
      // is file
      const resolvedPath = path.resolve(componentPath);
      const pathParsed = path.parse(resolvedPath);
      const relativeFilePath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
      if (!parsedId) {
        let dirName = pathParsed.dir;
        if (!dirName) {
          const absPath = path.resolve(componentPath);
          dirName = path.dirname(absPath);
        }
        const nameSpaceOrLastDir = namespace || R.last(dirName.split(path.sep));
        parsedId = BitId.getValidBitId(nameSpaceOrLastDir, pathParsed.name);

        updateIdAccordingToExistingComponent(parsedId.toString());
      }

      let files = [
        { relativePath: pathNormalizeToLinux(relativeFilePath), test: false, name: path.basename(relativeFilePath) }
      ];

      files = await mergeTestFilesWithFiles(files);
      const resolvedMainFile = addMainFileToFiles(files, main);
      // const mainFile = componentExists ? resolvedMainFile : relativeFilePath;
      return { componentId: parsedId, files, mainFile: resolvedMainFile };
    });

    let mapValues = await Promise.all(mapValuesP);

    // remove files that are excluded
    if (exclude) await removeExcludedFiles(mapValues, exclude);

    const componentId = mapValues[0].componentId;
    mapValues = mapValues.filter(mapVal => !(Object.keys(mapVal.files).length === 0));

    if (mapValues.length === 0) return { componentId, files: [] };
    if (mapValues.length === 1) return mapValues[0];

    const files = mapValues.reduce((a, b) => {
      return a.concat(b.files);
    }, []);
    const groupedComponents = groupby(files, 'relativePath');
    const uniqComponents = Object.keys(groupedComponents).map(key =>
      assignwith({}, ...groupedComponents[key], (val1, val2) => val1 || val2)
    );
    return { componentId, files: uniqComponents, mainFile: R.head(mapValues).mainFile };
  }

  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const ignoreList = retrieveIgnoreList(consumer.getPath());
  // check unknown test files
  const missingFiles = getMissingTestFiles(tests);
  if (!R.isEmpty(missingFiles)) throw new PathNotExists(missingFiles);

  const componentPathsStats = {};
  const resolvedComponentPathsWithGitIgnore = R.flatten(
    await Promise.all(componentPaths.map(componentPath => glob(componentPath, { ignore: ignoreList })))
  );
  const resolvedComponentPathsWithoutGitIgnore = R.flatten(
    await Promise.all(componentPaths.map(componentPath => glob(componentPath)))
  );

  // Run diff on both arrays to see what was filtered out because of the gitignore file
  const diff = arrayDiff(resolvedComponentPathsWithGitIgnore, resolvedComponentPathsWithoutGitIgnore);

  if (R.isEmpty(resolvedComponentPathsWithoutGitIgnore)) throw new PathNotExists(componentPaths);
  if (!R.isEmpty(resolvedComponentPathsWithGitIgnore)) {
    resolvedComponentPathsWithGitIgnore.forEach((componentPath) => {
      if (!existsSync(componentPath)) {
        throw new PathNotExists(componentPath);
      }
      componentPathsStats[componentPath] = {
        isDir: isDir(componentPath)
      };
    });
  } else {
    throw new NoFiles(diff);
  }

  const keepDirectoriesName = false;
  // if a user entered multiple paths and entered an id, he wants all these paths to be one component
  const isMultipleComponents = Object.keys(componentPathsStats).length > 1 && !id;
  let added = [];
  if (isMultipleComponents) {
    logger.debug('bit add - multiple components');
    const testToRemove = !R.isEmpty(tests) ? await getFiles(Object.keys(componentPathsStats), tests) : [];
    testToRemove.forEach(test => delete componentPathsStats[path.normalize(test)]);
    const addedP = Object.keys(componentPathsStats).map((onePath) => {
      return addOneComponent(
        {
          [onePath]: componentPathsStats[onePath]
        },
        bitMap,
        consumer,
        ignoreList
      );
    });

    added = await Promise.all(addedP);
    validateNoDuplicateIds(added);
    added.forEach(
      component =>
        (!R.isEmpty(component.files)
          ? addOrUpdateExistingComponentsInBitMap(consumer.projectPath, bitMap, component)
          : /* addToBitMap(bitMap, component) */ '')
    );
  } else {
    logger.debug('bit add - one component');
    // when a user enters more than one directory, he would like to keep the directories names
    // so then when a component is imported, it will write the files into the original directories

    const addedOne = await addOneComponent(componentPathsStats, bitMap, consumer, ignoreList);
    if (!R.isEmpty(addedOne.files)) {
      const addedComponents = addOrUpdateExistingComponentsInBitMap(consumer.projectPath, bitMap, addedOne);
      // addToBitMap(bitMap, addedOne);
      added.push(addedComponents);
    }
  }
  await bitMap.write();
  return R.flatten(added.filter(addedId => !R.isEmpty(addedId.files)));
});
