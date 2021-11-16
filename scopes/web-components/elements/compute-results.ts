import { ArtifactDefinition, ArtifactsStorageResolver, ComponentResult } from '@teambit/builder';
import { BundlerContext, BundlerResult } from '@teambit/bundler';

export async function computeResults(
  context: BundlerContext,
  results: BundlerResult[],
  outDirName: string,
  generatedBy: string,
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

  const artifacts = getArtifactDef(outDirName, generatedBy, storageResolvers);

  return {
    componentsResults,
    artifacts,
  };
}

function getArtifactDef(
  outDirName: string,
  generatedBy: string,
  storageResolvers?: ArtifactsStorageResolver[]
): ArtifactDefinition[] {
  return [
    {
      name: 'element',
      globPatterns: [`${outDirName}/public/**`],
      generatedBy,
      description: 'UMD bundle of a web component wrapper',
      // TODO: support more than one resolver
      storageResolver: storageResolvers?.length ? storageResolvers?.map((resolver) => resolver.name) : undefined,
    },
  ];
}
