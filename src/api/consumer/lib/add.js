/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import format from 'string-format';
import { glob, isValidIdChunk, isDir, calculateFileInfo } from '../../../utils';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS, REGEX_PATTERN } from '../../../constants';
import logger from '../../../logger/logger';
import isGlob from 'is-glob';


export default async function addAction(componentPaths: string[], id?: string, main?: string, namespace:?string, tests?: string[], exclude?: string[]): Promise<Object> {

  function getPathRelativeToProjectRoot(componentPath, projectRoot) {
    if (!componentPath) return componentPath;
    const absPath = path.resolve(componentPath);
    return absPath.replace(`${projectRoot}${path.sep}`, '');
  }

  // todo: remove the logic of fixing the absolute paths, it is already done in BitMap class
  async function addOneComponent(componentPathsStats: Object, bitMap: BitMap, consumer: Consumer,
                                 keepDirectoryName: boolean = false) {

    //remove excluded files from file list
    async function removeExcludedFiles (mapValues, excludedList){
      const resolvedExcludedFiles = await getAllFiles(excludedList);
      mapValues.forEach(mapVal => {
        mapVal.files = mapVal.files.filter(key => !resolvedExcludedFiles[key.relativePath] );
        mapVal.testsFiles = mapVal.testsFiles.filter(testFile => !resolvedExcludedFiles[testFile])
      });
    }

    //Split tests array according to glob or dsl
    function splitTestAccordingToPattern(tests){
      const domainSpecificTestFiles =[];
      const globArray =[];
      tests.forEach(file => file.match(REGEX_PATTERN) ? domainSpecificTestFiles.push(file) : globArray.push(file));
      return ({ domainSpecificTestFiles: domainSpecificTestFiles, testFiles: globArray })
    }

    //update test files according to dsl
    function updateFilesAccordingToDsl(files,domainSpecificStrings) {
      const newFilesArr = files;
      if (domainSpecificStrings) {
        domainSpecificStrings.forEach(dsl => {
          files.forEach(file => {
            const fileInfo = calculateFileInfo(file.relativePath)
            const generatedFile = format(dsl, fileInfo);
            if (fs.existsSync(generatedFile)) newFilesArr.push({relativePath: generatedFile, test: true, name: path.basename(generatedFile)});
          })
        })
      }
      return newFilesArr;
    }
    //used for updating main file if exists or dosent exists
    function addMainFileToFiles(files,mainFile) {
      if (mainFile && mainFile.match(REGEX_PATTERN)) {
          files.forEach(file => {
            const fileInfo = calculateFileInfo(file.relativePath)
            const generatedFile = format(mainFile, fileInfo);
            const foundFile = R.find(R.propEq('relativePath', generatedFile))(files);
            if (foundFile) {
              mainFile = foundFile.relativePath;
            }
            if (fs.existsSync(generatedFile) && !foundFile) {
              files.push({ relativePath: generatedFile, test: false, name: path.basename(generatedFile) });
              mainFile = generatedFile
            }
          });
      }
      return mainFile;
    }
    const markTestsFiles = (files, relativeTests) => {
      relativeTests.forEach(testPath => {
        const file = R.find(R.propEq('relativePath', testPath))(files);
        if (file){
          file.test = true;
        } else { // Support case when a user didn't enter the test file into the files
          files.push({relativePath: testPath, test: true, name: path.basename(testPath)});
        }
      });

      return files;
    }

    const addToBitMap = ({ componentId, files, mainFile, testsFiles }): { id: string, files: string[] } => {
      const relativeTests = testsFiles || [];
      files = markTestsFiles(files, relativeTests, domainSpecificTestFiles);
      bitMap.addComponent({ componentId, files, mainFile,
        origin: COMPONENT_ORIGINS.AUTHORED });
      return { id: componentId.toString(), files };
    };

    async function getAllFiles(files: string[]){
      const filesArr = await Promise.all(files.map(async componentPath => {
        const files = {};
        if (isGlob(componentPath)){
          const matches = await glob(componentPath);
          matches.forEach((match) =>  files[match] = match);
        } else if (fs.existsSync(componentPath) && isDir(componentPath)) {
          const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
          const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
          matches.forEach((match) =>  files[match] = match);
        } else { // is file
          const relativeFilePath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
          files[relativeFilePath] = relativeFilePath
        }
        return files;
      }));
      return R.mergeAll(filesArr);
    }

    let parsedId: BitId;
    let componentExists = false;
    if (id) {
      componentExists = bitMap.isComponentExist(id);
      parsedId = BitId.parse(id);
    }

    const { domainSpecificTestFiles, testFiles } = splitTestAccordingToPattern(tests);
    tests = Object.keys(await getAllFiles(testFiles)).map( (item) => item);

    const mapValuesP = await Object.keys(componentPathsStats).map(async (componentPath) => {
      if (componentPathsStats[componentPath].isDir) {
        const relativeComponentPath = getPathRelativeToProjectRoot(componentPath, consumer.getPath());
        const absoluteComponentPath = path.resolve(componentPath);
        const splitPath = absoluteComponentPath.split(path.sep);
        const lastDir = splitPath[splitPath.length-1];
        const nameSpaceOrDir = namespace || splitPath[splitPath.length-2];

        const matches = await glob(path.join(relativeComponentPath, '**'), { cwd: consumer.getPath(), nodir: true });
        if (!matches.length) throw new Error(`The directory ${relativeComponentPath} is empty, nothing to add`);

        let files = matches.map(match => { return { relativePath: match, test: false, name: path.basename(match) }});

        //mark or add test files according to dsl
        files = updateFilesAccordingToDsl(files,domainSpecificTestFiles);
        const resolvedMainFile = addMainFileToFiles(files,main);
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

        return { componentId: parsedId, files, mainFile: resolvedMainFile, testsFiles: tests };
      } else { // is file
        var resolvedPath = path.resolve(componentPath);
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

        let files = [{ relativePath: relativeFilePath, test: false, name: path.basename(relativeFilePath) }];

        //mark or add test files according to dsl
        files = updateFilesAccordingToDsl(files,domainSpecificTestFiles);
        const resolvedMainFile = addMainFileToFiles(files,main);

        if (componentExists) {
          return { componentId: parsedId, files, mainFile: resolvedMainFile, testsFiles: tests };
        }

        return { componentId: parsedId, files, mainFile: relativeFilePath, testsFiles: tests };
      }
    });


    var mapValues = await Promise.all(mapValuesP);

    //remove files that are excluded
    if (exclude) await removeExcludedFiles(mapValues,exclude);

    const componentId = mapValues[0].componentId;
    mapValues = mapValues.filter(mapVal => !(Object.keys(mapVal.files).length === 0));

    if (mapValues.length === 0) return ({ id: componentId, files:[] });
    if (mapValues.length === 1) return addToBitMap(mapValues[0]);

    const files = mapValues.reduce((a, b) => {
      return a.concat(b.files);
    }, []);

    return addToBitMap({ componentId, files, mainFile: main, testsFiles: tests });
  }

  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());

  const componentPathsStats = {};
  componentPaths.forEach((componentPath) => {
    componentPathsStats[componentPath] = {
      isDir: isDir(componentPath)
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
    const isPathDirectory = c => c.isDir;
    const onlyDirs = R.filter(isPathDirectory, componentPathsStats);
    keepDirectoriesName = Object.keys(onlyDirs).length > 1;
    const addedOne = await addOneComponent(componentPathsStats, bitMap, consumer, keepDirectoriesName);
    added.push(addedOne);
  }
  await bitMap.write();
  return added;
}
