/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import format from 'string-format';
import {
  glob,
  isDir,
  calculateFileInfo,
  existsSync,
  pathNormalizeToLinux,
  pathJoinLinux,
  pathResolve
} from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS, REGEX_PATTERN } from '../../../constants';
import logger from '../../../logger/logger';
import PathNotExists from './exceptions/path-not-exists';
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
  function getPathRelativeToProjectRoot(componentPath, projectRoot) {
    if (!componentPath) return componentPath;
    const absPath = path.resolve(componentPath);
    return absPath.replace(`${projectRoot}${path.sep}`, '');
  }

  // todo: remove the logic of fixing the absolute paths, it is already done in BitMap class
  async function addOneComponent(componentPathsStats: Object, bitMap: BitMap, consumer: Consumer) {
    // remove excluded files from file list
    async function removeExcludedFiles(mapValues, excludedList) {
      const resolvedExcludedFiles = await getAllFiles(excludedList);
      mapValues.forEach((mapVal) => {
        mapVal.files = mapVal.files.filter(key => !resolvedExcludedFiles[key.relativePath]);
        mapVal.testsFiles = mapVal.testsFiles.filter(testFile => !resolvedExcludedFiles[testFile]);
      });
    }

    // update test files according to dsl
    async function updateTestFilesAccordingToDsl(files: ComponentMapFile, testFiles: string[]) {
      const newFilesArr = files;
      const fileList = await testFiles.map(async (dsl) => {
        const fileList = await files.map(async (file) => {
          const fileInfo = calculateFileInfo(file.relativePath);
          const generatedFile = format(dsl, fileInfo);
          const matches = await glob(generatedFile);
          return matches ? getAllFiles(matches) : getAllFiles([generatedFile]);
        });
        return Promise.all(fileList);
      });
      const fileListRes = R.flatten(await Promise.all(fileList));
      const uniqFileList = R.uniq(fileListRes).filter(obj => !R.isEmpty(obj));
      uniqFileList.forEach((file) => {
        Object.keys(file).forEach((key) => {
          const fileIndex = R.findIndex(R.propEq('relativePath', file[key]))(newFilesArr);
          if (fileIndex > -1) newFilesArr[fileIndex].test = true;
          else if (fs.existsSync(key)) {
            newFilesArr.push({ relativePath: file[key], test: true, name: path.basename(file[key]) });
          }
        });
      });
      return newFilesArr;
    }
    // used for updating main file if exists or doesn't exists
    function addMainFileToFiles(files, mainFile) {
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

    const addToBitMap = ({ componentId, files, mainFile }): { id: string, files: string[] } => {
      bitMap.addComponent({
        componentId,
        files,
        mainFile,
        origin: COMPONENT_ORIGINS.AUTHORED,
        override
      });
      return { id: componentId.toString(), files: bitMap.getComponent(componentId).files };
    };

    async function getAllFiles(files: string[]) {
      const filesArr = await Promise.all(
        files.map(async (componentPath) => {
          const files = {};
          const matches = await glob(componentPath);
          if (matches) {
            matches.forEach(match => (files[pathNormalizeToLinux(match)] = pathNormalizeToLinux(match)));
          } else if (fs.existsSync(componentPath) && isDir(componentPath)) {
            const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
            const matches = await glob(pathJoinLinux(relativeComponentPath, '**'), {
              cwd: consumer.getPath(),
              nodir: true
            });
            matches.forEach(match => (files[pathNormalizeToLinux(match)] = pathNormalizeToLinux(match)));
          } else {
            // is file
            const relativeFilePath = pathNormalizeToLinux(
              getPathRelativeToProjectRoot(componentPath, consumer.getPath())
            );
            files[relativeFilePath] = relativeFilePath;
          }
          return files;
        })
      );

      return R.mergeAll(filesArr);
    }

    let parsedId: BitId;
    let componentExists = false;
    if (id) {
      const existingComponentId = bitMap.getExistingComponentId(id);
      componentExists = !!existingComponentId;
      if (componentExists && bitMap.getComponent(existingComponentId).origin === COMPONENT_ORIGINS.NESTED) {
        throw new Error(`One of your dependencies (${existingComponentId}) has already the same namespace and name. 
      If you're trying to add a new component, please choose a new namespace or name.
      If you're trying to update a dependency component, please re-import it individually`);
      }

      if (componentExists) id = existingComponentId;
      parsedId = BitId.parse(id);
    }

    // const { domainSpecificTestFiles, testFiles } = splitTestAccordingToPattern(tests);
    // tests = Object.keys(await getAllFiles(testFiles)).map( (item) => item);

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
        // mark or add test files according to dsl
        const newFileArrWithTests = await updateTestFilesAccordingToDsl(files, tests);
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

        return { componentId: parsedId, files: newFileArrWithTests, mainFile: resolvedMainFile, testsFiles: tests };
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
        const nameSpaceOrlastDir = namespace || R.last(dirName.split(path.sep));
        parsedId = BitId.getValidBitId(nameSpaceOrlastDir, pathParsed.name);
      }

      const files = [
        { relativePath: pathNormalizeToLinux(relativeFilePath), test: false, name: path.basename(relativeFilePath) }
      ];

      // mark or add test files according to dsl
      const newFileArrWithTests = await updateTestFilesAccordingToDsl(files, tests);
      const resolvedMainFile = addMainFileToFiles(files, main);

      if (componentExists) {
        return { componentId: parsedId, files: newFileArrWithTests, mainFile: resolvedMainFile, testsFiles: tests };
      }

      return { componentId: parsedId, files: newFileArrWithTests, mainFile: relativeFilePath, testsFiles: tests };
    });

    let mapValues = await Promise.all(mapValuesP);

    // remove files that are excluded
    if (exclude) await removeExcludedFiles(mapValues, exclude);

    const componentId = mapValues[0].componentId;
    mapValues = mapValues.filter(mapVal => !(Object.keys(mapVal.files).length === 0));

    if (mapValues.length === 0) return { id: componentId, files: [] };
    if (mapValues.length === 1) return addToBitMap(mapValues[0]);

    const files = mapValues.reduce((a, b) => {
      return a.concat(b.files);
    }, []);

    return addToBitMap({ componentId, files, mainFile: main });
  }

  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());

  const componentPathsStats = {};
  const resolvedComponentPaths = await Promise.all(componentPaths.map(componentPath => glob(componentPath)));
  const flattendFiles = R.flatten(resolvedComponentPaths);
  if (!R.isEmpty(flattendFiles)) {
    flattendFiles.forEach((componentPath) => {
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
  return added.filter(id => !R.isEmpty(id.files));
});
