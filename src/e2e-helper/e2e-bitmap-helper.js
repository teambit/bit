// @flow
import path from 'path';
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

  readBitMap(bitMapPath: string = path.join(this.scopes.localScopePath, BIT_MAP), withoutComment: boolean = true) {
    const map = fs.readFileSync(bitMapPath) || {};
    // $FlowFixMe
    return json.parse(map.toString('utf8'), null, withoutComment);
  }

  readBitMapWithoutVersion() {
    const bitMap = this.readBitMap();
    delete bitMap.version;
    return bitMap;
  }

  writeBitMap(bitMap: Object) {
    const bitMapPath = path.join(this.scopes.localScopePath, BIT_MAP);
    return fs.writeJSONSync(bitMapPath, bitMap, { spaces: 2 });
  }
  deleteBitMap() {
    return this.fs.deletePath(BIT_MAP);
  }
  createBitMap(
    cwd: string = this.scopes.localScopePath,
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
  printBitMapFilesInCaseOfError(files: Object[]): string {
    const filesStr = files.map(f => f.name).join(', ');
    return `Files in bitmap file: ${filesStr}`;
  }
}
