import path from 'path';
import webpack from 'webpack';
import MemoryFS from 'memory-fs';

export async function bundleFixture(fixturePath: string) {
  const fixture = `./${fixturePath}`;
  const compiler = webpack({
    mode: 'development',
    context: __dirname,
    entry: `./${fixturePath}`,
    output: {
      path: path.resolve(__dirname),
      filename: 'bundle.js'
    },
    node: false,
    module: {
      rules: [
        {
          test: /\.mdx?$/,
          use: [
            {
              loader: 'babel-loader',
              options: {
                babelrc: false,
                configFile: false,
                presets: ['@babel/preset-env', '@babel/preset-react']
              }
            },
            {
              loader: require.resolve(path.join(__dirname, '..'))
            }
          ]
        }
      ]
    }
  });

  compiler.outputFileSystem = new MemoryFS();

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (!stats) return reject(new Error('no modules compiled'));
      if (stats.hasErrors()) return reject(stats.compilation.errors);

      const json = stats.toJson({source: true});
      const modules = json.modules;
      if (!modules) {
        return reject(new Error('no modules compiled'));
      }

      const module = modules.find(m => m?.name?.startsWith(fixture));
      if (!module) {
        return reject(new Error('module not found'));
      }

      return resolve(module)
    });
  });
}
