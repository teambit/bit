// eslint-disable-next-line max-classes-per-file
import pMapSeries from 'p-map-series';
import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
import { ComponentMain, ComponentFactory, Component } from '@teambit/component';
import { EnvsMain } from './environments.main.runtime';

export class ListEnvsCmd implements Command {
  name = 'list';
  description = 'list all envs currently used in the workspace';
  options = [];
  group = 'component-config';

  constructor(
    private envs: EnvsMain,
    private componentAspect: ComponentMain
  ) {}

  async report() {
    const allEnvs = this.envs.getAllRegisteredEnvsIds().join('\n');
    const title = chalk.green('the following envs are available in the workspace:');
    return `${title}\n${allEnvs}`;
  }
}

type GetEnvOpts = {
  services: string;
};

export class GetEnvCmd implements Command {
  name = 'get <component-name>';
  description = "show config information from a component's env";
  arguments = [
    {
      name: 'component-name',
      description: "the 'component name' or 'component id' of the component whose env you'd like to inspect",
    },
  ];
  examples: [{ cmd: 'get ui/button'; description: 'show config information from the env configured for ui/button' }];
  options = [
    [
      '',
      'services <string>',
      'show information about the specific services only. for multiple services, separate by a comma and wrap with quotes',
    ],
  ] as CommandOptions;
  group = 'component-config';

  constructor(
    private envs: EnvsMain,
    private componentAspect: ComponentMain
  ) {}

  async showEnv(id: string, host: ComponentFactory, servicesArr: string[] | undefined) {
    const component = await host.get(await host.resolveComponentId(id));
    if (!component) throw new Error(`component for env ${id} was not found`);
    const env = this.envs.getEnv(component);
    const envRuntime = await this.envs.createEnvironment([component]);
    const envExecutionContext = envRuntime.getEnvExecutionContext();
    const services = this.envs.getServices(env);
    const allP = services.services.map(async ([serviceId, service]) => {
      if (servicesArr && !servicesArr.includes(serviceId)) return null;
      const serviceTitle = chalk.cyan.bold.underline(serviceId);
      const content = service.render ? await service.render(env, envExecutionContext) : '';
      return `${serviceTitle}\n\n${content}`;
    });

    const all = compact(await Promise.all(allP));

    const envTitle = chalk.green(`Environment: ${env.id}`);
    return `${envTitle}\n${all.join('\n\n')}`;
  }

  async report([name]: [string], { services }: GetEnvOpts): Promise<string> {
    const host = this.componentAspect.getHost();
    const servicesArr = services ? services.split(',') : undefined;

    // TODO: think what to do re this line with gilad.
    if (!host) throw new Error('error: workspace not found');
    return this.showEnv(name, host, servicesArr);
  }
}

export class EnvsCmd implements Command {
  name = 'envs';
  alias = 'env';
  description = 'list all components maintained by the workspace and their corresponding envs';
  options = [];
  group = 'component-config';
  commands: Command[] = [];

  // private showNonLoadedEnvsWarning = false;
  private nonLoadedEnvs = new Set<string>();

  constructor(
    private envs: EnvsMain,
    private componentAspect: ComponentMain
  ) {}

  async report(): Promise<string> {
    const host = this.componentAspect.getHost();
    // TODO: think what to do re this line with gilad.
    if (!host) throw new Error('error: workspace not found');
    const components = await host.list();
    const table = await this.getTable(components);
    const warning = this.getNonLoadedEnvsWarning();
    return warning ? `${table}\n${warning}` : table;
  }

  private async getTable(components: Component[]) {
    const tableData = await pMapSeries(components, async (component) => {
      // const envId = this.envs.getEnvId(component);
      const envId = await this.envs.calculateEnvId(component);
      const envIdStr = envId.toString();
      const isLoaded = this.envs.isEnvRegistered(envIdStr);
      if (!isLoaded) {
        this.nonLoadedEnvs.add(envIdStr);
      }
      const envWithErr = isLoaded ? envIdStr : `${envIdStr} ${chalk.red('(not loaded)')}`;
      return {
        component: component.id.toString(),
        env: envWithErr,
      };
    });

    const header = [
      {
        value: 'component',
      },
      {
        value: 'env',
      },
    ];
    const table = CLITable.fromObject(header, tableData);
    table.sort();
    return table.render();
  }

  getNonLoadedEnvsWarning() {
    if (!this.nonLoadedEnvs.size) return '';
    const list = Array.from(this.nonLoadedEnvs.values()).join(',');
    return chalk.yellow(`warning: bit wasn't able to load the following envs: ${chalk.cyan(list)}.
please run ${chalk.cyan("'bit install'")} to fix. if this doesn't help, run ${chalk.cyan(
      "'bit status'"
    )} to see if there are any additional issues`);
  }
}
