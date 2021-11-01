import { ArtifactDefinition, BuildContext, ComponentResult } from '@teambit/builder';
import { BundlerContext, BundlerResult } from '@teambit/bundler';

export async function computeResults(context: BundlerContext, results: BundlerResult[], outDirName: string) {
  const result = results[0];

  const componentsResults: ComponentResult[] = result.components.map((component) => {
    return {
      component,
      errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
      warning: result.warnings,
    };
  });

  const artifacts = getArtifactDef(outDirName);

  return {
    componentsResults,
    artifacts,
  };
}

function getArtifactDef(outDirName: string): ArtifactDefinition[] {
  return [
    {
      name: 'element',
      globPatterns: [`${outDirName}/public/**`],
    },
  ];
}
