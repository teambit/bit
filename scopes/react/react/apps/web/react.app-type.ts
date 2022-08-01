import { ApplicationType } from '@teambit/application';
import type { Logger } from '@teambit/logger';
import { ReactAppOptions } from './react-app-options';
import { ReactApp } from './react.application';
import { ReactEnv } from '../../react.env';

export class ReactAppType implements ApplicationType<ReactAppOptions> {
  constructor(readonly name: string, private reactEnv: ReactEnv, private logger?: Logger) {}

  createApp(options: ReactAppOptions) {
    return new ReactApp(
      options.name,
      options.entry,
      options.ssr,
      options.portRange || [3000, 4000],
      this.reactEnv,
      options.prerender,
      options.bundler,
      options.devServer,
      options.webpackTransformers,
      options.deploy,
      options.favicon,
      this.logger
    );
  }
}
