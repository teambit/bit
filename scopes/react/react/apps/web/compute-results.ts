import { BundlerResult } from '@teambit/bundler';
import { ReactAppBuildResult } from './react-build-result';

type resultsOptions = {
  publicDir: string;
  ssrPublicDir?: string;
};
export async function computeResults(
  results: BundlerResult[],
  { publicDir, ssrPublicDir }: resultsOptions
): Promise<ReactAppBuildResult> {
  const result = results[0];

  return {
    publicDir,
    ssrPublicDir,
    errors: result.errors,
    warnings: result.warnings,
  };
}
