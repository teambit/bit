import R from 'ramda';
import isGlob from 'is-glob';
import fs from 'fs-extra';
import { pathNormalizeToLinux } from './path';
import { PathOsBased } from './path';

const DSL = ['{PARENT}', '{FILE_NAME}'];

export default function getMissingTestFiles(tests: PathOsBased[]): PathOsBased[] {
  let missingTestFiles: PathOsBased[] = [];
  const realTestFiles = tests.filter((testFile) => {
    const files = DSL.filter((pattern) => testFile.indexOf(pattern) > -1);
    const glob = isGlob(pathNormalizeToLinux(testFile));
    return !glob && R.isEmpty(files) ? testFile : undefined;
  });
  if (!R.isEmpty(realTestFiles)) {
    missingTestFiles = realTestFiles.filter((testFile) => !fs.existsSync(testFile));
  }
  return missingTestFiles;
}
