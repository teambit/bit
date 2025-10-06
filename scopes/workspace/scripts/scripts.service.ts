import type { EnvService, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import chalk from 'chalk';
import type { Scripts } from './scripts';
import type { ScriptsMap } from './script-definition';

export type ScriptsDescriptor = {
  id: string;
  displayName: string;
  scripts: ScriptsMap;
};

type ScriptsTransformationMap = ServiceTransformationMap & {
  getScripts: () => Scripts;
};

export class ScriptsService implements EnvService<{}, ScriptsDescriptor> {
  name = 'Scripts';

  async render(env: EnvDefinition) {
    const descriptor = await this.getDescriptor(env);
    if (!descriptor || Object.keys(descriptor.scripts).length === 0) {
      return '';
    }

    const title = chalk.green('available scripts:');
    const scriptsList = Object.entries(descriptor.scripts)
      .map(([name, handler]) => {
        const handlerStr = typeof handler === 'function' ? chalk.gray('[function]') : chalk.cyan(handler);
        return `  ${chalk.bold(name)}: ${handlerStr}`;
      })
      .join('\n');

    return `${title}\n${scriptsList}`;
  }

  async getDescriptor(env: EnvDefinition): Promise<ScriptsDescriptor | undefined> {
    if (!env.env.getScripts) return undefined;
    const scripts = env.env.getScripts();
    if (!scripts) return undefined;

    return {
      id: this.name,
      displayName: this.name,
      scripts: scripts.getAll(),
    };
  }

  transform(env: Env, context: EnvContext): ScriptsTransformationMap | undefined {
    if (!env?.scripts) return undefined;
    const scriptsObj = env.scripts()(context);
    return {
      getScripts: () => scriptsObj,
    };
  }
}
