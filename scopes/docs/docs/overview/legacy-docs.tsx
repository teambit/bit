import { ComponentModel } from '@teambit/component';

// these envs had header in their docs
const ENV_WITH_LEGACY_DOCS = ['react', 'env', 'aspect', 'lit', 'html', 'node', 'mdx', 'react-native', 'readme'];

export function hasLegacyDocs(component: ComponentModel, envType: string) {
  const previewIncludesEnvsTemplate = component?.preview?.includesEnvTemplate !== false;

  return previewIncludesEnvsTemplate && ENV_WITH_LEGACY_DOCS.includes(envType);
}
