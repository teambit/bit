import InjectBodyPlugin from 'inject-body-webpack-plugin';
import type { WebpackConfigTransformer } from '@teambit/webpack';

export type BodyInjectionOptions = {
  content: string;
  position?: 'start' | 'end';
};

export function BodyInjectionTransformer(options: BodyInjectionOptions): WebpackConfigTransformer {
  return (config) => {
    // @ts-ignore - https://github.com/Jaid/inject-body-webpack-plugin/issues/12
    const plugin = new InjectBodyPlugin(options);

    return config.addPlugin(plugin);
  };
}
