import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import Table from 'tty-table';
import { ComponentMain } from '../component.main.runtime';

export class ShowCmd implements Command {
  name = 'showx <id>';
  description = 'show a component';
  alias = '';
  group = 'component';
  options = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['j', 'json', 'return the compile results in json format'],
  ] as CommandOptions;

  constructor(
    private component: ComponentMain
  ) {}

  async report([idStr]: [string]) {
    const host = this.component.getHost()
    const id = await host.resolveComponentId(idStr);
    const component = await host.get(id);

    
    
    const table = new Table(header, tableData, options);
    return table.render();
  }
}
