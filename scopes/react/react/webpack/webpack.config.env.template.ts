import { Configuration } from 'webpack';

// when editing, make sure you are letter pefect!
// "browser" -> browser optimized file (best)
// "main" -> usually cjs, when package is not `type: "module"`, and esm when package is `type: "module"`
// "module" -> usually esm, when package is not `type: "module"`
const preferCjs = ['browser', 'main', 'module'];

export function templateWebpackConfigFactory(): Configuration {
  return {
    name: 'react.env-template',
    output: {
      filename: '[name].[chunkhash].js',
    },

    // prefering cjs when when available,
    // because expose-loader doesn't work well with esm packages with tree-shaking
    resolve: {
      mainFields: preferCjs,
      extensions: [
        '.web.js',
        '.js', // <-- prefering .js before .mjs (important for packages like 'graphql')
        '.cjs',
        '.web.mjs',
        '.mjs',
        '.web.ts',
        '.ts',
        '.web.tsx',
        '.tsx',
        '.json',
        '.web.jsx',
        '.jsx',
        '.mdx',
        '.md',
      ],
    },
  };
}
