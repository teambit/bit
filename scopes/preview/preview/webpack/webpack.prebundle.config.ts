import { Configuration, ProvidePlugin } from 'webpack';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import createBaseConfig from '@teambit/ui/dist/webpack/webpack.base.config';

export default function createWebpackConfig(outputDir: string, entryFile: string): Configuration {
  const baseConfig = createBaseConfig(outputDir, entryFile);
  const preBundleConfig = createPreBundleConfig(outputDir);

  const combined = merge(baseConfig, preBundleConfig);

  return combined;
}

function createPreBundleConfig(outputDir: string) {
  const preBundleConfig: Configuration = {
    output: {
      path: outputDir,
      library: {
        type: 'commonjs2',
      },
    },
    externalsType: 'commonjs',
    externals: [
      'react',
      'react-dom',
      '@mdx-js/react',
      '@teambit/mdx.ui.mdx-scope-context',
      '@teambit/preview.modules.preview-modules',
    ],
    plugins: [new ProvidePlugin({ process: fallbacksProvidePluginConfig.process })],
  };

  return preBundleConfig;
}
