import { COMPONENT_PREVIEW_STRATEGY_NAME } from '@teambit/preview/dist/strategies/strategies-names.js';
import type { PreviewStrategyName } from '@teambit/preview';

export const NODE_ENV_ICON = 'https://static.bit.dev/extensions-icons/nodejs.svg';
export const NodeEnvType = 'node';

export function getNodeEnvDescriptor() {
  return { type: NodeEnvType };
}

export function getNodePreviewConfig(): { strategyName: PreviewStrategyName; splitComponentBundle: boolean } {
  return { strategyName: COMPONENT_PREVIEW_STRATEGY_NAME, splitComponentBundle: false };
}
