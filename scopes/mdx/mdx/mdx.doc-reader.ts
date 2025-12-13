import type { DocReader } from '@teambit/docs';
import { Doc } from '@teambit/docs';
import { compileSync } from '@mdx-js/mdx';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';

export class MDXDocReader implements DocReader {
  constructor(private extensions: string[]) {}

  async read(path: string, contents: Buffer) {
    const output = compileSync(contents.toString('utf-8'), mdxOptions);
    const metadata = output.data.frontmatter as any;

    const doc = Doc.from(path, metadata);
    return doc;
  }

  isFormatSupported(format: string) {
    return this.extensions.includes(format);
  }
}
