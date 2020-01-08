import { Bit } from '../bit';

export type ExtensionResolverConfig = {};

export type ExtensionResolverDeps = [Bit];

export async function extensionResolverProvider(config: ExtensionResolverConfig, [bit]: ExtensionResolverDeps) {
  const bitConfig = bit.config;
  // if (bitConfig.extensions) return;
}
