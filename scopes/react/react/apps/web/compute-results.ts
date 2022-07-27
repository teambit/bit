import { BundlerResult } from '@teambit/bundler';
import { ReactAppBuildResult } from './react-build-result';

type resultsOptions = {
  publicDir: string;
};
export async function computeResults(
  results: BundlerResult[],
  { publicDir }: resultsOptions
): Promise<ReactAppBuildResult> {
  const result = results[0];

  return {
    publicDir,
    errors: result.errors,
    warnings: result.warnings,
  };
}
