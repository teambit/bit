import { Variants } from './variants';
import { WorkspaceConfig } from '../workspace-config';

// TODO: remove this once config passed through harmony
export type VariantsDeps = [WorkspaceConfig];

export async function provideVariants([workspaceConfig]: VariantsDeps) {
  const variants = new Variants(workspaceConfig);
  return variants;
}
