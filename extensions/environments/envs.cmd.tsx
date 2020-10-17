import Table from 'tty-table';
import { Command } from '@teambit/cli';
import { ComponentMain } from '@teambit/component';
import { EnvsMain } from './environments.main.runtime';

export class EnvsCmd implements Command {
  name = 'envs [name]';
  alias = 'e';
  shortDescription = 'show all component envs';
  description = 'show all components envs';
  options = [];
  group = 'component';

  constructor(private envs: EnvsMain, private componentAspect: ComponentMain) {}

  async report(): Promise<string> {
    const components = await this.componentAspect.getHost().list();
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
