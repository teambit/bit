import {
  EnvService,
  EnvDefinition,
  Env,
  EnvContext,
  ServiceTransformationMap,
  GetNpmIgnoreContext,
} from '@teambit/envs';
import highlight from 'cli-highlight';
import chalk from 'chalk';
import { PackageJsonProps } from './pkg.main.runtime';

export type PkgDescriptor = {
  id: string;
  displayName: string;
  config?: string;
};

type PkgTransformationMap = ServiceTransformationMap & {
  getPackageJsonProps: () => PackageJsonProps;
  getNpmIgnore: (npmIgnoreContext?: GetNpmIgnoreContext) => string[];
};

export class PkgService implements EnvService<{}, PkgDescriptor> {
  name = 'Pkg';

  async render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);
    const parsed = JSON.parse(descriptor?.config || '{}');
    const { packageJsonProps, npmIgnore } = parsed;
    const jsonPropsTitle = chalk.green('configured package.json properties: ');
    const config = packageJsonProps
      ? highlight(JSON.stringify(packageJsonProps, null, 2), { language: 'json', ignoreIllegals: true })
      : '';
    const npmignoreTitle = chalk.green('configured npm ignore entries: ');
    return `${jsonPropsTitle}\n${config}\n\n${npmignoreTitle}\n${npmIgnore.join('\n')}`;
  }

  transform(env: Env, context: EnvContext): PkgTransformationMap | undefined {
    // Old env
    if (!env?.package) return undefined;
    const packageGenerator = env.package()(context);

    return {
      getPackageJsonProps: () => packageGenerator.packageJsonProps,
      // TODO: somehow handle context here? used in the aspect env
      getNpmIgnore: () => packageGenerator.npmIgnore,
      modifyPackageJson: packageGenerator.modifyPackageJson,
    };
  }

  getDescriptor(env: EnvDefinition): PkgDescriptor | undefined {
    if (!env.env.getPackageJsonProps) return undefined;
    const props = env.env.getPackageJsonProps();
    const npmIgnore = env.env.getNpmIgnore();
    const config = {
      packageJsonProps: props,
      npmIgnore: npmIgnore,
    };

    return {
      id: this.name,
      config: JSON.stringify(config, null, 2),
      displayName: this.name,
    };
  }
}
