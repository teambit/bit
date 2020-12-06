import { DocReader, Doc } from '@teambit/docs';
import { compile } from '@teambit/modules.mdx-compiler';

export class MDXDocReader implements DocReader {
  async read(path: string, contents: Buffer) {
    const output = await compile(contents.toString('utf-8'), { filepath: path });
    const metadata = output.getMetadata();

    const doc = Doc.from(path, metadata);
    return doc;
  }

  readonly extensions = ['.mdx', '.md'];

  isFormatSupported(format: string) {
    return this.extensions.includes(format);
  }
}
