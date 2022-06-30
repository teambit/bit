import { ApplicationType } from '@teambit/application';
import { ReactAppOptions } from './react-app-options';
import { ReactApp } from './react.application';
import { ReactEnv } from '../../react.env';

export class ReactAppType implements ApplicationType<ReactAppOptions> {
  constructor(readonly name: string, private reactEnv: ReactEnv) {}

  async createApp(options: ReactAppOptions) {
    return new ReactApp(
      options.name,
      options.entry,
      options.portRange || [3000, 4000],
      this.reactEnv,
      options.prerender,
      options.bundler,
      options.devServer,
      options.webpackTransformers,
      options.deploy,
      options.favicon
    );
  }
}
