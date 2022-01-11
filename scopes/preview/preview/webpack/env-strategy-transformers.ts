import HtmlWebpackPlugin from 'html-webpack-plugin';
import { WebpackConfigMutator } from '@teambit/webpack';
import { html } from './html';

export function outputNamesTransformer(config: WebpackConfigMutator): WebpackConfigMutator {
  config.raw.output = config.raw.output || {};
  config.raw.output.filename = 'static/js/[name].[contenthash:8].js';
  // There are also additional JS chunk files if you use code splitting.
  config.raw.output.chunkFilename = 'static/js/[name].[contenthash:8].chunk.js';
  return config;
}

export function generateHtmlPluginTransformer(options: { dev?: boolean }) {
  const htmlPlugin = generateHtmlPluginForModule(options);
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.addPlugin(htmlPlugin);
    return config;
  };
}

function generateHtmlPluginForModule(options: { dev?: boolean }) {
  const baseConfig = {
    inject: true,
    templateContent: html('Preview'),
    cache: false,
    minify: options?.dev ?? true,
  };
  return new HtmlWebpackPlugin(baseConfig);
}

export const transformersArray = [outputNamesTransformer];
