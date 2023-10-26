import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import camelcase from 'camelcase';
import type { ComponentMap } from '@teambit/component';

export type MainModulesMap = {
  /**
   * Path to default module in case there is no specific module for the current environment.
   */
  default: string;
  [envId: string]: string;
};

// :TODO refactor to building an AST and generate source code based on it.
export function generateLink(
  prefix: string,
  componentMap: ComponentMap<string[]>,
  mainModulesMap?: MainModulesMap,
  isSplitComponentBundle = false
): string {
  const links = componentMap.toArray().map(([component, modulePath], compIdx) => ({
    componentIdentifier: component.id.fullName,
    modules: modulePath.map((path, pathIdx) => ({
      varName: moduleVarName(compIdx, pathIdx),
      resolveFrom: toWindowsCompatiblePath(path),
    })),
  }));

  let modulesLinks;
  if (mainModulesMap) {
    modulesLinks = Object.entries(mainModulesMap).map(([envId, path]) => {
      const resolveFrom = toWindowsCompatiblePath(path);
      const varName = getEnvVarName(envId);
      return { envId, varName, resolveFrom };
    });
  }

  return `
  import { linkModules } from '@teambit/preview.modules.preview-modules';

${links
  .map((link) => link.modules.map((module) => `import * as ${module.varName} from "${module.resolveFrom}";`).join('\n'))
  .filter((line) => line !== '') // prevent empty lines
  .join('\n')}

${modulesLinks.map((module) => `import * as ${module.varName} from "${module.resolveFrom}";`).join('\n')}

linkModules('${prefix}', {
  modulesMap: {
    ${modulesLinks
      // must include all components, including empty
      .map((module) => `"${module.envId}": ${module.varName}`)
      .join(',\n    ')}
  },
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
${links
  // must include all components, including empty
  .map((link) => `    "${link.componentIdentifier}": [${link.modules.map((module) => module.varName).join(', ')}]`)
  .join(',\n')}
  }
});
`;
}

function moduleVarName(componentIdx: number, fileIdx: number) {
  return `file_${componentIdx}_${fileIdx}`;
}

function getEnvVarName(envId: string) {
  const envNameFormatted = camelcase(envId.replace('@', '').replace('.', '-').replace(/\//g, '-'));
  const varName = `${envNameFormatted}MainModule`;
  return varName;
}
