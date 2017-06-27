/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import { DEFAULT_IMPL_NAME } from '../../../constants';

export default async function addAction(componentPaths: string[], id?: string, index?: string, spec?: string): Promise<Object> {

  function addBitMapRecords(componentPath: string, bitMap: BitMap, consumer: Consumer) {
    let parsedId: BitId;
    if (id) {
      parsedId = BitId.parse(id);
    }
    let stat;
    try {
      stat = fs.lstatSync(componentPath);
    } catch (err) {
      throw new Error(`The path ${componentPath} doesn't exist`);
    }
    if (stat.isFile()) {
      const pathParsed = path.parse(componentPath);
      let dirName = pathParsed.dir;
      if (!dirName) {
        const absPath = path.resolve(componentPath);
        dirName = path.dirname(absPath);
      }
      const lastDir = R.last(dirName.split(path.sep));
      if (!parsedId) {
        parsedId = new BitId({ name: pathParsed.name, box: lastDir });
      }
      let relativeDirName = dirName;
      if (path.isAbsolute(dirName)) {
        // the path should be relative to the project root
        // e.g. consumerPath: /root/project, dirName: /root/project/src/components, the
        // relativeDirName would be src/components
        relativeDirName = dirName.replace(`${consumer.getPath()}${path.sep}`, '');
      }
      // const relativeDirName = path.isAbsolute(dirName) ? '.' : dirName;
      bitMap.addComponent(parsedId.toString(), relativeDirName, pathParsed.base, spec);
      return parsedId;
    } else { // is directory
      const pathParsed = path.parse(componentPath);
      const implFileName = index || DEFAULT_IMPL_NAME;
      const parsedFileName = path.parse(implFileName);
      if (!parsedId) {
        parsedId = new BitId({ name: parsedFileName.name, box: pathParsed.name });
      }
      bitMap.addComponent(parsedId.toString(), componentPath, implFileName, spec);
      return parsedId;
    }
  }

  if (componentPaths.length > 1 && id) {
    throw new Error('When specifying more than one path, the ID is automatically generated out of the directory and file name');
  }
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());

  const added = [];
  componentPaths.forEach(componentPath => {
    const addedId = addBitMapRecords(componentPath, bitMap, consumer);
    added.push(addedId);
  });

  await bitMap.write();
  return { added };
}
