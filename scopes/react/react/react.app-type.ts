import { ApplicationType } from '@teambit/application';
import { ReactEnv } from './react.env';
import { ReactAppOptions } from './react-app-options';
import { ReactApp } from './react.application';

export class ReactAppType implements ApplicationType<ReactAppOptions> {
  constructor(readonly name: string, private reactEnv: ReactEnv) { }

  createApp(options: ReactAppOptions) {
    return new ReactApp(options.name, options.entry, options.portRange || [3000, 4000], this.reactEnv, options.deploy, options.prerenderRoutes);
  }
}
