import InjectBodyPlugin from 'inject-body-webpack-plugin';
import type { WebpackConfigTransformer } from '../webpack.main.runtime';

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
 * @deprecated the webpack aspect no longer builds the base config for react/node/aspect envs, so
 * this is no longer guaranteed to share an `html-webpack-plugin` instance with the bundler that
 * actually built the config (`@teambit/webpack.webpack-bundler`). Kept only for backward-compatible imports.
 */
export function GenerateBodyInjectionTransformer(options: BodyInjectionOptions): WebpackConfigTransformer {
  return (config) => {
    // @ts-ignore - https://github.com/Jaid/inject-body-webpack-plugin/issues/12
    const plugin = new InjectBodyPlugin(options);

    return config.addPlugin(plugin);
  };
}
