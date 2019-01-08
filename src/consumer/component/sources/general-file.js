// @flow
import fs from 'fs-extra';
import AbstractVinyl from './abstract-vinyl';

export default class GeneralFile extends AbstractVinyl {
  override: ?boolean = false;

  async write(): Promise<string> {
    if (!this.override && fs.existsSync(this.path)) {
      return Promise.resolve(this.path);
    }
    await fs.outputFile(this.path, this.contents);
    return Promise.resolve(this.path);
  }

  static load({
    filePath,
    content,
    override = false
  }: {
    filePath: string,
    content: string,
    override?: boolean
  }): GeneralFile {
    const generalFile = new GeneralFile({ path: filePath, contents: new Buffer(content) });
    generalFile.override = override;
    return generalFile;
  }
}
