import { WebpackConfigMutator } from '@teambit/webpack';
import { remove } from 'lodash';
import TerserPlugin from 'terser-webpack-plugin';

export function addDevServer(configMutator: WebpackConfigMutator) {
  return configMutator.addTopLevel('devServer', {
    allowedHosts: 'all',
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function setOutput(configMutator: WebpackConfigMutator) {
  if (!configMutator.raw.output) configMutator.raw.output = {};
  configMutator.raw.output.publicPath = '/';

  return configMutator;
}

export function replaceTerserPlugin({ prerender = false }: { prerender: boolean }) {
  return (configMutator: WebpackConfigMutator) => {
    if (!configMutator.raw.optimization?.minimizer) return configMutator;

    remove(configMutator.raw.optimization?.minimizer, (minimizer) => {
      return minimizer.constructor.name === 'TerserPlugin';
    });

    const terserer = prerender ? CreateTerserPluginForPrerender() : CreateTerserPlugin();
    configMutator.raw.optimization?.minimizer.push(terserer);

    return configMutator;
  };
}

function CreateTerserPlugin() {
  return new TerserPlugin({
    minify: TerserPlugin.esbuildMinify,
    // `terserOptions` options will be passed to `esbuild`
    // Link to options - https://esbuild.github.io/api/#minify
    terserOptions: {
      minify: true,
    },
  });
}

function CreateTerserPluginForPrerender() {
  return new TerserPlugin({
    extractComments: false,
    terserOptions: {
      parse: {
        // We want terser to parse ecma 8 code. However, we don't want it
        // to apply any minification steps that turns valid ecma 5 code
        // into invalid ecma 5 code. This is why the 'compress' and 'output'
        // sections only apply transformations that are ecma 5 safe
        // https://github.com/facebook/create-react-app/pull/4234
        ecma: 8,
      },
      compress: {
        ecma: 5,
        warnings: false,
        // Disabled because of an issue with Uglify breaking seemingly valid code:
        // https://github.com/facebook/create-react-app/issues/2376
        // Pending further investigation:
        // https://github.com/mishoo/UglifyJS2/issues/2011
        comparisons: false,
        // Disabled because of an issue with Terser breaking valid code:
        // https://github.com/facebook/create-react-app/issues/5250
        // Pending further investigation:
        // https://github.com/terser-js/terser/issues/120
        inline: 2,
      },
      mangle: {
        safari10: true,
      },
      output: {
        ecma: 5,
        comments: false,
        // Turned on because emoji and regex is not minified properly using default
        // https://github.com/facebook/create-react-app/issues/2488
        ascii_only: true,
      },
    },
  });
}
