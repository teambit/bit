// eslint-disable-next-line max-classes-per-file
import React from 'react';
import { Text, Newline } from 'ink';
import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import { Command } from '@teambit/cli';
import { ComponentMain, ComponentFactory, Component } from '@teambit/component';
import { EnvsMain } from './environments.main.runtime';
import { EnvOverview } from './components/env-overview';

export class ListEnvsCmd implements Command {
  name = 'list';
  description = 'list all envs available in the workspace';
  options = [];
  group = 'development';

  constructor(private envs: EnvsMain, private componentAspect: ComponentMain) {}

  async report() {
    const allEnvs = this.envs.getAllRegisteredEnvs().join('\n');
    const title = chalk.green('the following envs are available in the workspace:');
    return `${title}\n${allEnvs}`;
  }
}

export class GetEnvCmd implements Command {
  name = 'get <component-name>';
  description = "show information about a component's env";
  arguments = [
    {
      name: 'component-name',
      description: "the 'component name' or 'component id' of the component its env you'd like to inspect",
    },
  ];
  examples: [{ cmd: 'get ui/button'; description: 'show information about the env configured for ui/button' }];
  options = [];
  group = 'development';

  constructor(private envs: EnvsMain, private componentAspect: ComponentMain) {}

  async showEnv(id: string, host: ComponentFactory) {
    const component = await host.get(await host.resolveComponentId(id));
    if (!component) throw new Error(`component for env ${id} was not found`);
    const env = this.envs.getEnv(component);
    const envRuntime = await this.envs.createEnvironment([component]);
    const envExecutionContext = envRuntime.getEnvExecutionContext();
    const services = this.envs.getServices(env);
    const allP = services.services.map(async ([serviceId, service]) => {
      if (service.render)
        return (
          <Text>
            <Text bold underline color="cyan">
              {serviceId}
            </Text>
            <Newline />
            <Newline />
            {await service.render(env, envExecutionContext)}
          </Text>
        );
      return (
        <Text key={serviceId}>
          <Text bold underline>
            {serviceId}
          </Text>
        </Text>
      );
    });

    const all = await Promise.all(allP);

    return (
      <Text>
        <EnvOverview envDef={env} />
        {all.map((item) => item)}
      </Text>
    );
  }

  async render([name]: [string]): Promise<JSX.Element> {
    const host = this.componentAspect.getHost();
    // TODO: think what to do re this line with gilad.
    if (!host) throw new Error('error: workspace not found');
    return this.showEnv(name, host);
  }
}

export class EnvsCmd implements Command {
  name = 'envs';
  alias = 'env';
  description = 'list all components maintained by the workspace and their corresponding envs';
  options = [];
  group = 'development';
  commands: Command[] = [];

  constructor(private envs: EnvsMain, private componentAspect: ComponentMain) {}

  async render(): Promise<JSX.Element> {
    const host = this.componentAspect.getHost();
    // TODO: think what to do re this line with gilad.
    if (!host) throw new Error('error: workspace not found');
    const components = await host.list();
    // TODO: refactor to a react table
    return <Text>{this.getTable(components)}</Text>;
  }

  private getTable(components: Component[]) {
    const tableData = components.map((component) => {
      const env = this.envs.getDescriptor(component);
      return {
        component: component.id.toString(),
        env: env ? env.id : 'N/A',
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
}
