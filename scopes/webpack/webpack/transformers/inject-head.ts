import { InjectHeadPlugin } from '@teambit/webpack.plugins.inject-head-webpack-plugin';
import type { WebpackConfigTransformer } from '@teambit/webpack';

export type HeadInjectionOptions = {
  content: string;
  position?: 'start' | 'end';
};

/**
 * A transformer that allow you to inject content into your html head
 * We expose it from here, as it uses the inject-head-webpack-plugin which register to the html plugin hooks
 * which means it depends on the fact that it has the same html plugin instance
 * since, the html plugin is configured via the webpack aspect, expose it from here ensure the same instance
 * @param options
 * @returns
 */
export function GenerateHeadInjectionTransformer(options: HeadInjectionOptions): WebpackConfigTransformer {
  return (config) => {
    const plugin = new InjectHeadPlugin(options);
    return config.addPlugin(plugin);
  };
}
