import { ArtifactDefinition, ArtifactsStorageResolver, ComponentResult } from '@teambit/builder';
import { BundlerContext, BundlerResult } from '@teambit/bundler';

export async function computeResults(
  context: BundlerContext,
  results: BundlerResult[],
  outDirName: string,
  storageResolvers?: ArtifactsStorageResolver[]
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

  const artifacts = getArtifactDef(outDirName, storageResolvers);

  return {
    componentsResults,
    artifacts,
  };
}

function getArtifactDef(outDirName: string, storageResolvers?: ArtifactsStorageResolver[]): ArtifactDefinition[] {
  return [
    {
      name: 'elements',
      globPatterns: [`${outDirName}/public/**`],
      // TODO: support more than one resolver
      storageResolver: storageResolvers?.length ? storageResolvers?.map((resolver) => resolver.name) : undefined,
    },
  ];
}
