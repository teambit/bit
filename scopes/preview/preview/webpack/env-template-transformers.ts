import HtmlWebpackPlugin from 'html-webpack-plugin';
import { WebpackConfigMutator } from '@teambit/webpack';
import { html } from './html';
import { PreviewDefinition } from '../preview-definition';

export function splitChunksTransformer(config: WebpackConfigMutator): WebpackConfigMutator {
  config.raw.optimization = config.raw.optimization || {};
  config.raw.optimization.splitChunks = {
    chunks: 'all',
    name: false,
  };
  return config;
}

export function runtimeChunkTransformer(config: WebpackConfigMutator): WebpackConfigMutator {
  config.raw.optimization = config.raw.optimization || {};
  config.raw.optimization.runtimeChunk = {
    // name: (entrypoint) => `runtime-${entrypoint.name}`,
    name: 'runtime',
  };
  return config;
}

export function generateHtmlPluginTransformer(
  previewDefs: PreviewDefinition[],
  previewRootChunkName: string,
  options: { dev?: boolean }
) {
  const htmlPlugins = previewDefs.map((previewModule) =>
    generateHtmlPluginForModule(previewModule, previewRootChunkName, options)
  );
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.addPlugins(htmlPlugins);
    return config;
  };
}

function generateHtmlPluginForModule(
  previewDef: PreviewDefinition,
  previewRootChunkName: string,
  options: { dev?: boolean }
) {
  const previewDeps = previewDef.include || [];
  const baseConfig = {
    inject: true,
    cache: false,
    chunks: [...previewDeps, previewDef.prefix, previewRootChunkName],
    filename: `${previewDef.prefix}.html`,
    templateContent: html('Preview'),
    minify: options?.dev ?? true,
    // Make sure the order is that the preview root coming after the preview def
    // we can't make it like this on the entries using depend on because this will
    // prevent the splitting between different preview defs
    chunksSortMode: 'manual' as const,
  };
  return new HtmlWebpackPlugin(baseConfig);
}

export const transformersArray = [splitChunksTransformer, runtimeChunkTransformer];
