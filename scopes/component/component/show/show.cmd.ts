import { Command, CommandOptions } from '@teambit/cli';
// import { Logger } from '@teambit/logger';
// import chalk from 'chalk';
import Table from 'tty-table';
import { MissingBitMapComponent } from 'bit-bin/dist/consumer/bit-map/exceptions';
import { ComponentMain } from '../component.main.runtime';

export class ShowCmd implements Command {
  name = 'show <id>';
  description = 'show a component';
  alias = '';
  group = 'component';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private component: ComponentMain) {}

  private async getComponent(idStr: string) {
    const host = this.component.getHost();
    const id = await host.resolveComponentId(idStr);
    const component = await host.get(id);
    if (!component) throw new MissingBitMapComponent(idStr);
    return component;
  }

  async report([idStr]: [string]) {
    const component = await this.getComponent(idStr);
    const fragments = this.component.getShowFragments();
    const rows = await Promise.all(
      fragments.map(async (fragment) => {
        const row = await fragment.renderRow(component);
        return [row.title, row.content];
      })
    );

    const options = {
      borderStyle: 'solid',
      paddingBottom: 0,
      headerAlign: 'center',
      align: 'left',
      headerColor: 'cyan',
    };

    const headers = [
      {
        width: 65,
        color: 'cyan',
      },
      {
        alias: 'content',
      },
    ];

    const table = new Table(headers, rows, options);
    return table.render();
  }

  async json([idStr]: [string]) {
    const component = await this.getComponent(idStr);
    const fragments = this.component.getShowFragments();
    const rows = await Promise.all(
      fragments.map(async (fragment) => {
        return fragment.json ? fragment.json(component) : undefined;
      })
    );

    return rows.filter((row) => !!row);
  }
}
