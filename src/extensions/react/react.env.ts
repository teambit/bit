import webpack from 'webpack';
import http from 'http';
import fs from 'fs';
import { resolve } from 'path';
import socketIO from 'socket.io';
import { join } from 'path';
import WebpackDevServer from 'webpack-dev-server';
import { Environment } from '../environments';
import { Tester, TesterExtension } from '../tester';
import { Component } from '../component';
import { Workspace } from '../workspace';
import createWebpackConfig from './webpack.config';
import { LogPublisher } from '../logger';
import { ExtensionDataEntry } from '../../consumer/config/extension-data';
import { docsTemplate } from './docs.tpl';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { BuildTask } from '../builder';
import { Compiler, Compile } from '../compiler';
import { PkgExtension } from '../pkg';

export class ReactEnv implements Environment {
  constructor(
    private logger: LogPublisher,
    private jest: JestExtension,
    private ts: TypescriptExtension,
    private compiler: Compile,
    private tester: TesterExtension,
    private pkg: PkgExtension
  ) {}

  // this should happen on component load.
  patchComponents(components: Component[], workspace: Workspace) {
    return components.map(component => {
      const docs = component.filesystem.readdirSync('/').filter(path => path.includes('.docs.'))[0];
      if (!docs) return component;
      // @ts-ignore
      const filepath = join(workspace.path, component.state._consumer.componentMap?.getComponentDir(), docs);
      component.state.store.push(
        new ExtensionDataEntry(
          undefined,
          undefined,
          '@teambit/docs',
          {},
          {
            filepath
          }
        )
      );

      return component;
    });
  }

  /**
   * returns the component linter.
   */
  getLinter() {}

  /**
   * returns a component tester.
   */
  getTester(): Tester {
    return this.jest.createTester(require.resolve('./jest/jest.config'));
  }

  /**
   * returns a component compiler.
   */
  getCompiler(): Compiler {
    // eslint-disable-next-line global-require
    const tsConfig = require('./typescript/tsconfig.json');
    return this.ts.createCompiler(tsConfig);
  }

  getPackageJsonProps() {
    return TypescriptExtension.getPackageJsonProps();
  }

  async dependencies() {
    return {
      dependencies: {
        react: '-'
      },
      // TODO: add this only if using ts
      devDependencies: {
        '@types/react': '^16.9.17'
      },
      // TODO: take version from workspace.json config
      peerDependencies: {
        react: '^16.12.0'
      }
    };
  }

  /**
   * returns a build pipeline.
   */
  getPipe(): BuildTask[] {
    // return BuildPipe.from([this.compiler.task, this.tester.task]);
    // return BuildPipe.from([this.tester.task]);
    return [this.compiler.task, this.pkg.dryRunTask];
  }

  dev(workspace: Workspace, components: Component[]) {
    // if (config.compiler.watch) {
    //   this.typescript.watch();
    // }
    // remove once gilad has metadata
    const patchedComponent = this.patchComponents(components, workspace);
    const config = createWebpackConfig(workspace.path, this.getEntries(patchedComponent));
    const compiler = webpack(config);

    const devSever = new WebpackDevServer(compiler, {
      publicPath: config.output.publicPath,
      hot: true,
      historyApiFallback: true,
      before(app) {
        const server = new http.Server(app);
        const io = socketIO(server);

        io.on('connection', () => {
          io.sockets.emit(
            'components',
            patchedComponent.map(component => {
              // refactor to compositions
              const docs = component.filesystem.readdirSync('/').filter(path => path.includes('.docs.'))[0];
              const componentDir = component.state._consumer.componentMap?.getComponentDir();
              if (!componentDir) throw new Error(`React.dev: component ${component.id.name} is missing componentMap`);
              return {
                id: component.id.toString(),
                docs: docs ? join(workspace.path, componentDir, docs) : null
              };
            })
          );
        });

        server.listen(4000, () => {
          // console.log('listening on *:4000');
        });
      },
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          pathRewrite: { '^/api': '' }
        },
        '/socket.io': {
          target: 'http://localhost:4000',
          ws: true
        }
      }
    });

    devSever.listen(3000, 'localhost', err => {
      if (err) {
        this.logger.error(err);
      }
    });
  }

  private getEntries(components: Component[]) {
    const docs = docsTemplate(components);
    const docsPath = resolve(join(__dirname, '/__docs.js'));
    fs.writeFileSync(docsPath, docs);

    const paths = components.map(component => {
      const path = join(
        // :TODO check how it works with david. Feels like a side-effect.
        // @ts-ignore
        component.state._consumer.componentMap?.getComponentDir(),
        // @ts-ignore
        component.config.main
      );

      return path;
    });

    return paths.concat(docsPath);
  }
}
