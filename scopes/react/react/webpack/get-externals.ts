import camelcase from 'camelcase';
import { generateExternals } from '@teambit/webpack.modules.generate-externals';

export function getExternals(deps: string[]) {
  return generateExternals(deps, {
    transformName: (depName) => camelcase(depName.replace('@', '').replace('/', '-'), { pascalCase: true }),
  });
}
