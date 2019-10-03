import * as path from 'path';
import fs from 'fs-extra';
import json from 'comment-json';
import { BIT_MAP } from '../constants';
import FsHelper from './e2e-fs-helper';
import ScopesData from './e2e-scopes';

export default class BitMapHelper {
  scopes: ScopesData;
  fs: FsHelper;
  constructor(scopes: ScopesData, fsHelper: FsHelper) {
    this.scopes = scopes;
    this.fs = fsHelper;
  }

  read(bitMapPath: string = path.join(this.scopes.localPath, BIT_MAP), withoutComment: boolean = true) {
    const map = fs.readFileSync(bitMapPath) || {};
    // $FlowFixMe
    return json.parse(map.toString('utf8'), null, withoutComment);
  }

  readWithoutVersion() {
    const bitMap = this.read();
    delete bitMap.version;
    return bitMap;
  }

  write(bitMap: Object) {
    const bitMapPath = path.join(this.scopes.localPath, BIT_MAP);
    return fs.writeJSONSync(bitMapPath, bitMap, { spaces: 2 });
  }
  delete() {
    return this.fs.deletePath(BIT_MAP);
  }
  create(
    cwd: string = this.scopes.localPath,
    // $FlowFixMe
    componentObject = {
      'bar/foo': {
        files: [
          {
            relativePath: 'bar/foo.js',
            test: false,
            name: 'foo.js'
          }
        ],
        mainFile: 'bar/foo.js',
        origin: 'AUTHORED'
      }
    },
    oldBitMapFile: boolean = false
  ) {
    const bitmapFile = path.join(cwd, oldBitMapFile ? '.bit.map.json' : BIT_MAP);

    const bitmap = {
      version: '0.11.1-testing'
    };
    // $FlowFixMe
    Object.keys(componentObject).forEach(key => (bitmap[key] = componentObject[key]));
    fs.ensureFileSync(bitmapFile);
    return fs.writeJsonSync(bitmapFile, bitmap, { spaces: 2 });
  }
  printFilesInCaseOfError(files: Object[]): string {
    const filesStr = files.map(f => f.name).join(', ');
    return `Files in bitmap file: ${filesStr}`;
  }
}
