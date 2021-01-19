import { VFile } from 'vfile';
import { ImportSpecifier } from './import-specifier';

/**
 * compilation output of bit-mdx format.
 */
export class CompileOutput {
  constructor(readonly file: VFile, private _renderer: string) {}

  get renderer() {
    return this._renderer;
  }

  changeRenderer(renderer: string) {
    this._renderer = renderer;
  }

  /**
   * get the mdx file metadata.
   */
  getMetadata() {
    const data: any = this.file.data;
    return data.frontmatter;
  }

  /**
   * get all import specifiers.
   */
  getImportSpecifiers(): ImportSpecifier[] {
    const data: any = this.file.data;
    return data.imports;
  }

  /**
   * get the mdx file contents. including the renderer.
   */
  get contents() {
    return `${this.renderer}\n${this.file.contents}`;
  }
}
