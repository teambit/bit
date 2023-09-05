import { BundlerResult } from '@teambit/bundler';
import { ReactAppBuildResult } from './react-build-result';

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
    publicDir,
    ssrPublicDir,
    metadata: {
      publicDir,
      ssrPublicDir,
    },
    errors: result.errors,
    warnings: result.warnings,
  };
}
