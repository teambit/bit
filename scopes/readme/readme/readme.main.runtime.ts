import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { MainRuntime } from '@teambit/cli';
import MDXAspect, { MDXMain } from '@teambit/mdx';
import { Component } from '@teambit/component';
import { ReactEnv } from '@teambit/react';

import { ReadmeAspect } from './readme.aspect';

export class ReadmeMain {
  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, MDXAspect];
  _readmeEnv: ReactEnv;
  get readmeEnv() {
    return this._readmeEnv;
  }
  private set readmeEnv(value: ReactEnv) {
    this._readmeEnv = value;
  }
  icon() {
    // TODO: Add icon for aspect
    return 'https://static.bit.dev/extensions-icons/default.svg';
  }
  static async provider([envs, mdx]: [EnvsMain, MDXMain]) {
    const readme = new ReadmeMain();
    const readmeEnv = envs.compose(mdx._mdxEnv, [
      envs.override({
        overrideDocsDevPatterns: true,
        getDevPatterns: (component: Component) => [component.mainFile, 'index.*'],
      }),
    ]);
    envs.registerEnv(readmeEnv);
    readme.readmeEnv = readmeEnv as ReactEnv;
    return readme;
  }
}

ReadmeAspect.addRuntime(ReadmeMain);
