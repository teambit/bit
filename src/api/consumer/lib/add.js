/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import { glob } from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { DEFAULT_INDEX_NAME } from '../../../constants';
import logger from '../../../logger/logger';

export default async function addAction(componentPaths: string[], id?: string, main?: string, tests?: string[]): Promise<Object> {

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

  async function addOneComponent(componentPathsStats: Object, bitMap: BitMap, consumer: Consumer,
                                 keepDirectoryName: boolean = false) {

    const addToBitMap = ({ componentId, files, mainFile, testsFiles }): { id: string, files: string[] } => {
      const relativeTests = testsFiles ?
        tests.map(spec => getPathRelativeToProjectRoot(spec, consumer.getPath())) : [];
      bitMap.addComponent(componentId.toString(), files, mainFile, relativeTests);
      return { id: componentId.toString(), files };
    };

    let parsedId: BitId;
    let componentExists = false;
    if (id) {
      componentExists = bitMap.isComponentExist(id);
      parsedId = BitId.parse(id);
    }

    const mapValuesP = await Object.keys(componentPathsStats).map(async (componentPath) => {

      if (componentPathsStats[componentPath].isDirectory) {
        // todo: make sure "bit add ." is working as well
        const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
        const absoluteComponentPath = path.resolve(componentPath);
        const splitPath = absoluteComponentPath.split(path.sep);
        const lastDir = splitPath[splitPath.length-1];
        const oneBeforeLastDir = splitPath[splitPath.length-2];

        const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
        if (!matches.length) throw new Error(`The directory ${relativeComponentPath} is empty, nothing to add`);

        let mainFileName = main;
        if (!main) {
          mainFileName = matches.length === 1 ? matches[0] : DEFAULT_INDEX_NAME;
        }

        const files = {};
        matches.forEach((match) => {
          const fileName = path.basename(match);
          if (keepDirectoryName) {
            const baseDir = path.basename(path.dirname(match));
            const dirWithFile = path.join(baseDir, fileName);
            files[dirWithFile] = { path: match };
          } else {
            files[fileName] = { path: match };
          }
        });

        if (!parsedId) {
          parsedId = new BitId({ name: lastDir, box: oneBeforeLastDir });
        }
        return { componentId: parsedId, files, mainFile: mainFileName, testsFiles: tests };
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
          parsedId = new BitId({ name: pathParsed.name, box: lastDir });
        }

        const files = { [pathParsed.base]: { path: relativeFilePath} };

        if (componentExists) {
          return { componentId: parsedId, files, mainFile: main, testsFiles: tests };
        }

        return { componentId: parsedId, files, mainFile: relativeFilePath, testsFiles: tests };
      }
    });

    const mapValues = await Promise.all(mapValuesP);

    if (mapValues.length === 1) return addToBitMap(mapValues[0]);

    const files = R.mergeAll(mapValues.map(value => value.files));
    const componentId = mapValues[0].componentId;
    if (!main && !Object.keys(files).includes(DEFAULT_INDEX_NAME)) {
      throw new Error(`Please specify your main file. The default main file "${DEFAULT_INDEX_NAME}" is not in the added files`);
    }
    const mainFile = main || DEFAULT_INDEX_NAME;

    return addToBitMap({ componentId, files, mainFile, testsFiles: tests });
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
    const addedP = Object.keys(componentPathsStats).map(onePath => addOneComponent({
      [onePath]: componentPathsStats[onePath]}, bitMap, consumer));
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
