import R from 'ramda';
import isGlob from 'is-glob';
import fs from 'fs';
import { pathNormalizeToLinux } from './index';

const DSL = ['{PARENT}', '{FILE_NAME}'];

export default function getMissingTestFiles(tests) {
  let missingTestFiles = [];
  const realTestFiles = tests.filter((testFile) => {
    const files = DSL.filter(pattern => testFile.indexOf(pattern) > -1);
    const glob = isGlob(pathNormalizeToLinux(testFile));
    return !glob && R.isEmpty(files) ? testFile : undefined;
  });
  if (!R.isEmpty(realTestFiles)) {
    missingTestFiles = realTestFiles.filter(testFile => !fs.existsSync(testFile));
  }
  return missingTestFiles;
}
