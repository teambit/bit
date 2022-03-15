import InjectBodyPlugin from 'inject-body-webpack-plugin';
import type { WebpackConfigTransformer } from '@teambit/webpack';

export type BodyInjectionOptions = {
  content: string;
  position?: 'start' | 'end';
};

/**
 * A transformer that allow you to inject content into your html body
 * We expose it from here, as it uses the inject-body-webpack-plugin which register to the html plugin hooks
 * which means it depends on the fact that it has the same html plugin instance
 * since, the html plugin is configured via the webpack aspect, expose it from here ensure the same instance
 * @param options
 * @returns
 */
export function GenerateBodyInjectionTransformer(options: BodyInjectionOptions): WebpackConfigTransformer {
  return (config) => {
    // @ts-ignore - https://github.com/Jaid/inject-body-webpack-plugin/issues/12
    const plugin = new InjectBodyPlugin(options);

    return config.addPlugin(plugin);
  };
}
