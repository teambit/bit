import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { HtmlAspect } from './html.aspect';
import { HtmlEnv } from './html.env';

export class HtmlMain {
  static slots = [];
  static dependencies = [EnvsAspect, ReactAspect];
  static runtime = MainRuntime;
  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const htmlEnv: HtmlEnv = envs.merge(new HtmlEnv(), react.reactEnv);
    envs.registerEnv(htmlEnv);

  return new HtmlMain();
  }
}

HtmlAspect.addRuntime(HtmlMain);
