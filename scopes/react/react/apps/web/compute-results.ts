import type { BundlerResult } from '@teambit/bundler';
import type { ReactAppBuildResult } from './react-build-result';

type ResultsOptions = {
  publicDir: string;
  ssrPublicDir?: string;
};
export async function computeResults(
  results: BundlerResult[],
  { publicDir, ssrPublicDir }: ResultsOptions
): Promise<ReactAppBuildResult> {
  const result = results[0];

  return {
    publicDir, // TODO: remove this later. it's for backward compatibility. use "metadata.publicDir" instead.
    ssrPublicDir, // TODO: remove this later. it's for backward compatibility. use "metadata.ssrPublicDir" instead.
    metadata: {
      publicDir,
      ssrPublicDir,
    },
    errors: result.errors,
    warnings: result.warnings,
  };
}
