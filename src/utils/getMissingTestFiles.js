import R from 'ramda';
import isGlob from 'is-glob';
import fs from 'fs';
import { pathNormalizeToLinux } from './index';

const DSL = ['{PARENT_FOLDER}', '{FILE_NAME}'];

export default function getMissingTestFiles(tests) {
  const missingTestFiles = [];
  const realTestFiles = tests.filter((testFile) => {
    const files = DSL.filter(pattern => testFile.indexOf(pattern) > -1);
    const glob = isGlob(pathNormalizeToLinux(testFile));
    if (!glob && R.isEmpty(files)) return testFile;
  });
  if (!R.isEmpty(realTestFiles)) {
    realTestFiles.forEach((testFile) => {
      if (!fs.existsSync(testFile)) missingTestFiles.push(testFile);
    });
  }
  return missingTestFiles;
}
