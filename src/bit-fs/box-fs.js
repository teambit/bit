/** @flow */
import * as mkdirp from 'mkdirp';
import * as fs from 'fs';
import * as path from 'path';
import { BIT_DIR_NAME, RESOURCES, BIT_IMPORTED_DIRNAME, BIT_INLINE_DIRNAME, BIT_JSON } from '../constants';

export default class BoxFs {

  /**
   * @private
   **/
  static composeBoxPath(p: string): string {
    return path.join(p, BIT_DIR_NAME);
  }

  static composeBitInlinePath(boxPath: string, name: string) {
    return path.join(boxPath, BIT_DIR_NAME, BIT_INLINE_DIRNAME, name);
  }

  static composeFileName(name: string) {
    return `${name}.js`;
  }

  static createBit(bitName: string, boxPath: string) {
    const bitPath = this.composeBitInlinePath(boxPath, bitName);
    mkdirp.sync(bitPath);
    fs.writeFileSync(path.join(bitPath, this.composeFileName(bitName)), fs.readFileSync(path.resolve(__dirname, '../../resources/impl.template.js')));
    
    return bitPath;
  }

  static bitExists(bitName: string, boxPath: string) {
    return fs.existsSync(this.composeBitInlinePath(boxPath, bitName));
  }

  /**
   * @private
   **/
  static composePath(p: string, inPath: string) {
    return path.join(this.composeBoxPath(p), inPath); 
  }

  /**
   * @private
   **/
  static createDir(p: string, inPath: string) {
    return mkdirp.sync(this.composePath(p, inPath));
  }

  static createBox(p: string): boolean {
    if (this.pathHasBox(p)) return false;
    this.createBitJson(p);
    this.createDir(p, BIT_IMPORTED_DIRNAME);
    this.createDir(p, BIT_INLINE_DIRNAME);
    return true;
  }

  static readBitJsonTpl() {
    function resolveTplPath() {
      return path.resolve(__dirname, path.join(RESOURCES, 'bit.template.json'));
    }

    return fs
      .readFileSync(resolveTplPath())
      .toString();
  }

  static createBitJson(p: string) {
    if (this.hasBitJson(p)) return false;
    return fs.writeFileSync(
      this.composeBitJsonPath(p), 
      this.readBitJsonTpl()
    );
  }

  /**
   * @private
   **/
  static composeBitJsonPath(p: string) {
    return path.join(p, BIT_JSON);
  }

  static hasBitJson(p: string): boolean {
    return fs.existsSync(this.composeBitJsonPath(p));
  }

  /**
   * @private
   **/
  static pathHasBox(p: string): boolean {
    return fs.existsSync(this.composeBoxPath(p));
  }

  static locateClosestBox(absPath: string): ?string {
    function buildPropogationPaths(): string[] {
      const paths: string[] = [];
      const pathParts = absPath.split(path.sep);
      
      pathParts.forEach((val, index) => {
        const part = pathParts.slice(0, index).join('/');
        if (!part) return;
        paths.push(part);
      });

      return paths.reverse();
    }

    if (this.pathHasBox(absPath)) return absPath;
    const searchPaths = buildPropogationPaths();
    return searchPaths.find(searchPath => this.pathHasBox(searchPath));     
  }
}
