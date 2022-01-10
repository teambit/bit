import { ArtifactDefinition, ArtifactStorageResolver, ComponentResult } from '@teambit/builder';
import { BundlerContext, BundlerResult } from '@teambit/bundler';

export async function computeResults(
  context: BundlerContext,
  results: BundlerResult[],
  outDirName: string,
  storageResolver?: ArtifactStorageResolver
) {
  const result = results[0];

  const componentsResults: ComponentResult[] = result.components.map((component) => {
    return {
      component,
      startTime: result.startTime,
      endTime: result.endTime,
      errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
      warning: result.warnings,
    };
  });

  const artifacts = getArtifactDef(outDirName, storageResolver);

  return {
    componentsResults,
    artifacts,
  };
}

function getArtifactDef(outDirName: string, storageResolver?: ArtifactStorageResolver): ArtifactDefinition[] {
  return [
    {
      name: 'elements',
      globPatterns: [`${outDirName}/public/**`],
      storageResolver,
    },
  ];
}
