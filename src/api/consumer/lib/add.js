/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import format from 'string-format';
import assignwith from 'lodash.assignwith';
import groupby from 'lodash.groupby';
import {
  glob,
  isDir,
  calculateFileInfo,
  existsSync,
  pathNormalizeToLinux,
  pathJoinLinux,
  pathResolve,
  getMissingTestFiles
} from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS, REGEX_PATTERN } from '../../../constants';
import logger from '../../../logger/logger';
import PathNotExists from './exceptions/path-not-exists';
import DuplicateIds from './exceptions/duplicate-ids';

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
  // used to validate that no two files where added with the same id in the same bit add command
  const validateNoDuplicateIds = (addComponents: Object[]) => {
    const duplicateIds = {};
    const newGroupedComponents = groupby(addComponents, 'componentId');
    const componentsWithSameId = Object.keys(newGroupedComponents).forEach(
      key => (newGroupedComponents[key].length > 1 ? (duplicateIds[key] = newGroupedComponents[key]) : '')
    );
    if (!R.isEmpty(componentsWithSameId)) throw new DuplicateIds(duplicateIds);
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
        const matches = await glob(generatedFile);
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

  async function addOneComponent(componentPathsStats: Object, bitMap: BitMap, consumer: Consumer) {
    // remove excluded files from file list
    async function removeExcludedFiles(mapValues, excludedList) {
      const files = R.flatten(mapValues.map(x => x.files.map(i => i.relativePath)));
      const resolvedExcludedFiles = await getFiles(files, excludedList);
      mapValues.forEach((mapVal) => {
        if (resolvedExcludedFiles.includes(mapVal.mainFile)) {
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
      return mainFile;
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

    async function getTestFiles(files: ComponentMapFile[]): ComponentMapFile[] {
      const testFilesArr = !R.isEmpty(tests) ? await getFiles(files.map(file => file.relativePath), tests) : [];
      return testFilesArr.map(testFile => ({
        relativePath: testFile,
        test: true,
        name: path.basename(testFile)
      }));
    }

    const mapValuesP = await Object.keys(componentPathsStats).map(async (componentPath) => {
      if (componentPathsStats[componentPath].isDir) {
        const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
        const absoluteComponentPath = pathResolve(componentPath, false);
        const splitPath = absoluteComponentPath.split(path.sep);
        const lastDir = splitPath[splitPath.length - 1];
        const nameSpaceOrDir = namespace || splitPath[splitPath.length - 2];

        const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
        if (!matches.length) throw new EmptyDirectory();

        const files = matches.map((match) => {
          return { relativePath: pathNormalizeToLinux(match), test: false, name: path.basename(match) };
        });

        // get test files
        const testFiles = await getTestFiles(files);

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

        return { componentId: parsedId, files: files.concat(testFiles), mainFile: resolvedMainFile };
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

      const files = [
        { relativePath: pathNormalizeToLinux(relativeFilePath), test: false, name: path.basename(relativeFilePath) }
      ];

      const testFiles = await getTestFiles(files);
      const resolvedMainFile = addMainFileToFiles(files, main);
      const mainFile = componentExists ? resolvedMainFile : relativeFilePath;
      return { componentId: parsedId, files: files.concat(testFiles), mainFile };
    });

    let mapValues = await Promise.all(mapValuesP);

    // remove files that are excluded
    if (exclude) await removeExcludedFiles(mapValues, exclude);

    const componentId = mapValues[0].componentId;
    mapValues = mapValues.filter(mapVal => !(Object.keys(mapVal.files).length === 0));

    if (mapValues.length === 0) return { id: componentId, files: [] };
    if (mapValues.length === 1) return mapValues[0];

    const files = mapValues.reduce((a, b) => {
      return a.concat(b.files);
    }, []);
    const groupedComponents = groupby(files, 'relativePath');
    const uniqComponents = Object.keys(groupedComponents).map(key =>
      assignwith({}, ...groupedComponents[key], (val1, val2) => val1 || val2)
    );
    return { componentId, files: uniqComponents, mainFile: main };
  }

  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());

  // check unknown test files
  const missingFiles = getMissingTestFiles(tests);
  if (!R.isEmpty(missingFiles)) throw new PathNotExists(missingFiles);

  const componentPathsStats = {};
  const resolvedComponentPaths = await Promise.all(componentPaths.map(componentPath => glob(componentPath)));
  const flattenedFiles = R.flatten(resolvedComponentPaths);
  if (!R.isEmpty(flattenedFiles)) {
    flattenedFiles.forEach((componentPath) => {
      if (!existsSync(componentPath)) {
        throw new PathNotExists(componentPath);
      }
      componentPathsStats[componentPath] = {
        isDir: isDir(componentPath)
      };
    });
  } else {
    throw new PathNotExists(componentPaths);
  }

  let keepDirectoriesName = false;
  // if a user entered multiple paths and entered an id, he wants all these paths to be one component
  const isMultipleComponents = Object.keys(componentPathsStats).length > 1 && !id;
  let added = [];
  if (isMultipleComponents) {
    logger.debug('bit add - multiple components');
    const testToRemove = !R.isEmpty(tests) ? await getFiles(Object.keys(componentPathsStats), tests) : [];
    testToRemove.forEach(test => delete componentPathsStats[test]);
    const addedP = Object.keys(componentPathsStats).map((onePath) => {
      return addOneComponent(
        {
          [onePath]: componentPathsStats[onePath]
        },
        bitMap,
        consumer
      );
    });

    added = await Promise.all(addedP);
    validateNoDuplicateIds(added);
    added.forEach(component => addToBitMap(bitMap, component));
  } else {
    logger.debug('bit add - one component');
    // when a user enters more than one directory, he would like to keep the directories names
    // so then when a component is imported, it will write the files into the original directories
    const isPathDirectory = c => c.isDir;
    const onlyDirs = R.filter(isPathDirectory, componentPathsStats);
    keepDirectoriesName = Object.keys(onlyDirs).length > 1;
    const addedOne = await addOneComponent(componentPathsStats, bitMap, consumer, keepDirectoriesName);
    added.push(addedOne);
  }
  await bitMap.write();
  return added.filter(addedId => !R.isEmpty(addedId.files));
});
