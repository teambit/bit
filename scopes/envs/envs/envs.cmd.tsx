import React from 'react';
import { Text, Newline } from 'ink';
import Table from 'tty-table';
import { Command } from '@teambit/cli';
import { ComponentMain, ComponentFactory, Component } from '@teambit/component';
import { EnvsMain } from './environments.main.runtime';
import { EnvOverview } from './components/env-overview';

export class EnvsCmd implements Command {
  name = 'envs [name]';
  alias = 'env';
  shortDescription = 'show all component envs';
  description = 'show all components envs';
  options = [];
  group = 'development';

  constructor(private envs: EnvsMain, private componentAspect: ComponentMain) {}

  async showEnv(id: string, host: ComponentFactory) {
    const component = await host.get(await host.resolveComponentId(id));
    if (!component) throw new Error(`component for env ${id} was not found`);
    const env = this.envs.getEnv(component);
    const services = this.envs.getServices(env);
    const all = services.services.map(([serviceId, service]) => {
      if (service.render)
        return (
          <Text>
            <Text bold underline color="cyan">
              {serviceId}
            </Text>
            <Newline />
            <Newline />
            {service.render(env)}
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

    return (
      <Text>
        <EnvOverview envDef={env} />
        {all.map((item) => item)}
      </Text>
    );
  }

  async render([name]: [string]): Promise<JSX.Element> {
    const host = await this.componentAspect.getHost();
    // TODO: think what to do re this line with gilad.
    if (!host) throw new Error('error: workspace not found');
    if (name) return this.showEnv(name, host);
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

    const options = {
      borderStyle: 'solid',
      paddingBottom: 0,
      headerAlign: 'center',
      align: 'left',
      headerColor: 'cyan',
    };

    const table = new Table(header, tableData, options);
    return table.render();
  }
}
