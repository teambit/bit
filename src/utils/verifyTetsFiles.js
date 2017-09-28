import R from 'ramda';
import isGlob from 'is-glob';
import fs from 'fs';
import { pathNormalizeToLinux } from './index';

const DSL = ['{PARENT_FOLDER}', '{FILE_NAME}'];

class TestFileNotExists extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

export default function verifyTestFIles(tests) {
  const realTestFiles = tests.filter((testFile) => {
    const files = DSL.filter(pattern => testFile.indexOf(pattern) > -1);
    const glob = isGlob(pathNormalizeToLinux(testFile));
    if (!glob && R.isEmpty(files)) return testFile;
  });
  if (!R.isEmpty(realTestFiles)) {
    realTestFiles.forEach((testFile) => {
      if (!fs.existsSync(testFile)) throw new TestFileNotExists(testFile);
    });
  }
}
