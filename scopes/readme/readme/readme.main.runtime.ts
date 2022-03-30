import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { MainRuntime } from '@teambit/cli';
import MDXAspect, { MdxEnv, MDXMain } from '@teambit/mdx';
import { Component } from '@teambit/component';
import { ReactEnv } from '@teambit/react';

import { ReadmeAspect } from './readme.aspect';
import { ReadmeEnv } from './readme.env';

export class ReadmeMain {
  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, MDXAspect];
  constructor(protected env: ReadmeEnv & MdxEnv) {}
  icon() {
    // TODO: Add icon for aspect
    return 'https://static.bit.dev/extensions-icons/default.svg';
  }
  static async provider([envs, mdx]: [EnvsMain, MDXMain]) {
    const readmeEnv = envs.merge<ReadmeEnv, MdxEnv>(new ReadmeEnv(), mdx.mdxEnv);
    envs.registerEnv(readmeEnv);
    const readme = new ReadmeMain(readmeEnv);
    return readme;
  }
}

ReadmeAspect.addRuntime(ReadmeMain);
