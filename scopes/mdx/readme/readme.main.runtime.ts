import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { MainRuntime } from '@teambit/cli';
import MDXAspect, { MdxEnv, MDXMain } from '@teambit/mdx';
import DocsAspect, { DocsMain } from '@teambit/docs';

import { ReadmeAspect } from './readme.aspect';
import { ReadmeEnv } from './readme.env';

export class ReadmeMain {
  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, MDXAspect, DocsAspect];
  constructor(protected env: ReadmeEnv & MdxEnv, private docs: DocsMain) {}
  icon() {
    return 'https://static.bit.dev/bit-icons/file-text.svg';
  }
  static async provider([envs, mdx, docs]: [EnvsMain, MDXMain, DocsMain]) {
    const readmeEnv = envs.merge<ReadmeEnv, MdxEnv>(new ReadmeEnv(docs), mdx.mdxEnv);
    envs.registerEnv(readmeEnv);
    const readme = new ReadmeMain(readmeEnv, docs);
    return readme;
  }
}

ReadmeAspect.addRuntime(ReadmeMain);
