import webpack from 'webpack';
import { join } from 'path';
import WebpackDevServer from 'webpack-dev-server';
import merge from 'webpack-merge';
import { DevServer } from '../bundler';
import { WorkspaceExt, Workspace } from '../workspace';
import configFactory from './config/webpack.config';
import { Component } from '../component';

export class WebpackExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  createBundler() {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   * @param components array of components to launch.
   * @param config webpack config. will be merged to the base webpack config as seen at './config'
   */
  createDevServer(components: Component[], config: any): DevServer {
    const mergedConfig = merge(this.createConfig(components), config);
    const compiler = webpack(mergedConfig);
    return new WebpackDevServer(compiler);
  }

  private createConfig(components: Component[]) {
    return configFactory(this.workspace.path, this.getEntries(components));
  }

  private getEntries(components: Component[]) {
    // :TODO load all component files.
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

    return paths;
  }

  static slots = [];

  static dependencies = [WorkspaceExt];

  static async provide([workspace]: [Workspace]) {
    return new WebpackExtension(workspace);
  }
}
