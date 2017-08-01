/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import { glob, isValidIdChunk } from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS } from '../../../constants';
import logger from '../../../logger/logger';

export default async function addAction(componentPaths: string[], id?: string, main?: string, namespace:?string, tests?: string[], exclude?: string[]): Promise<Object> {

  function getPathRelativeToProjectRoot(componentPath, projectRoot) {
    if (!componentPath) return componentPath;
    const absPath = path.resolve(componentPath);
    return absPath.replace(`${projectRoot}${path.sep}`, '');
  }

  function isDirectory(userPath: string): boolean {
    let stat;
    try {
      stat = fs.lstatSync(userPath);
    } catch (err) {
      throw new Error(`The path ${userPath} doesn't exist`);
    }
    return stat.isDirectory();
  }

  // todo: remove the logic of fixing the absolute paths, it is already done in BitMap class
  async function addOneComponent(componentPathsStats: Object, bitMap: BitMap, consumer: Consumer,
                                 keepDirectoryName: boolean = false) {

    const addToBitMap = ({ componentId, files, mainFile, testsFiles }): { id: string, files: string[] } => {
      const relativeTests = testsFiles ?
        tests.map(spec => getPathRelativeToProjectRoot(spec, consumer.getPath())) : [];
      bitMap.addComponent({ componentId, componentPaths: files, mainFile,
        testsFiles: relativeTests, origin: COMPONENT_ORIGINS.AUTHORED });
      return { id: componentId.toString(), files };
    };

    const getValidBitId = (box: string, name: string): BitId => {
      // replace any invalid character with a dash character
      const makeValidIdChunk = (chunk) => {
        const invalidChars = /[^$\-_!.a-z0-9]+/g;
        const replaceUpperCaseWithDash = chunk.trim().split(/(?=[A-Z])/).join('-').toLowerCase();
        return replaceUpperCaseWithDash.replace(invalidChars, '-');
      };

      if (!isValidIdChunk(name)) name = makeValidIdChunk(name);
      if (!isValidIdChunk(box)) box = makeValidIdChunk(box);

      return new BitId({ name, box });
    };

    async function getExcludedFiles(excluded){
      const files = {};
      await excluded.forEach(async componentPath => {
        if (isDirectory(componentPath)) {
          const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
          const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
          matches.forEach((match) =>  files[match] = match);
          return files;
        } else { // is file
          const relativeFilePath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
          files[relativeFilePath] = relativeFilePath
          return  files;
        }
      });
      return files;
    }

    let parsedId: BitId;
    let componentExists = false;
    if (id) {
      componentExists = bitMap.isComponentExist(id);
      parsedId = BitId.parse(id);
    }

    const mapValuesP = await Object.keys(componentPathsStats).map(async (componentPath) => {

      if (componentPathsStats[componentPath].isDirectory) {
        const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
        const absoluteComponentPath = path.resolve(componentPath);
        const splitPath = absoluteComponentPath.split(path.sep);
        const lastDir = splitPath[splitPath.length-1];
        const oneBeforeLastDir = splitPath[splitPath.length-2];

        const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
        if (!matches.length) throw new Error(`The directory ${relativeComponentPath} is empty, nothing to add`);

        const files = {};
        matches.forEach((match) => {
          if (keepDirectoryName) {
            files[match] = match;
          } else {
            const stripMainDir = match.replace(`${relativeComponentPath}${path.sep}`, '');
            files[stripMainDir] = match;
          }
        });

        if (!parsedId) {
          parsedId = getValidBitId( namespace || oneBeforeLastDir, lastDir);
        }
        return { componentId: parsedId, files, mainFile: main, testsFiles: tests };
      } else { // is file
        const pathParsed = path.parse(componentPath);
        const relativeFilePath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());

        if (!parsedId) {
          let dirName = pathParsed.dir;
          if (!dirName) {
            const absPath = path.resolve(componentPath);
            dirName = path.dirname(absPath);
          }
          const lastDir = R.last(dirName.split(path.sep));
          parsedId = getValidBitId(namespace || lastDir, pathParsed.name);
        }

        const files = { [pathParsed.base]: relativeFilePath };

        if (componentExists) {
          return { componentId: parsedId, files, mainFile: main, testsFiles: tests };
        }

        return { componentId: parsedId, files, mainFile: relativeFilePath, testsFiles: tests };
      }
    });

    var mapValues = await Promise.all(mapValuesP);

    //FILTER - remove impl/test files
    if (exclude){
      const resolvedExcludedFiles = await getExcludedFiles(exclude);
      mapValues.forEach(mapVal => {
        Object.keys(mapVal.files).forEach(key => {
          if (resolvedExcludedFiles[mapVal.files[key]]){
            delete mapVal.files[key];
          }
        })
        mapVal.testsFiles = mapVal.testsFiles.filter(x=>!resolvedExcludedFiles[x])
      });
    }

    const componentId = mapValues[0].componentId;
    mapValues = mapValues.filter(x => !(Object.keys(x.files).length === 0));

    if (mapValues.length === 0) return ({ id: componentId, files:[] });
    if (mapValues.length === 1) return addToBitMap(mapValues[0]);

    const files = R.mergeAll(mapValues.map(value => value.files));
    return addToBitMap({ componentId, files, mainFile: main, testsFiles: tests });
  }

  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());

  const componentPathsStats = {};
  componentPaths.forEach((componentPath) => {
    componentPathsStats[componentPath] = {
      isDirectory: isDirectory(componentPath)
    };
  });

  let keepDirectoriesName = false;
  // if a user entered multiple paths and entered an id, he wants all these paths to be one component
  const isMultipleComponents = componentPaths.length > 1 && !id;
  let added = [];
  if (isMultipleComponents) {
    logger.debug('bit add - multiple components');
    const addedP = Object.keys(componentPathsStats).map(onePath => {
      return addOneComponent({
        [onePath]: componentPathsStats[onePath]}, bitMap, consumer)
    });
    added = await Promise.all(addedP);
  } else {
    logger.debug('bit add - one component');
    // when a user enters more than one directory, he would like to keep the directories names
    // so then when a component is imported, it will write the files into the original directories
    const isPathDirectory = c => c.isDirectory;
    const onlyDirs = R.filter(isPathDirectory, componentPathsStats);
    keepDirectoriesName = Object.keys(onlyDirs).length > 1;
    const addedOne = await addOneComponent(componentPathsStats, bitMap, consumer, keepDirectoriesName);
    added.push(addedOne);
  }
  await bitMap.write();

  return added;
}
