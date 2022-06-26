import compact from 'lodash.compact';
import type { BundlerHtmlConfig } from '@teambit/bundler';
import { PreviewDefinition } from '../preview-definition';
import { html } from './html-template';

import { CHUNK_NAMES } from './chunks';

export function generateHtmlConfig(previewDef: PreviewDefinition, options: { dev?: boolean }) {
  const chunks = compact([
    previewDef.includePeers && CHUNK_NAMES.peers,
    CHUNK_NAMES.previewRoot,
    ...(previewDef.include || []),
    previewDef.prefix,
  ]);

  const config: BundlerHtmlConfig = {
    title: 'Preview',
    templateContent: html('Preview'),
    minify: options?.dev ?? true,
    chunks,
    filename: `${previewDef.prefix}.html`,
  };
  return config;
}
