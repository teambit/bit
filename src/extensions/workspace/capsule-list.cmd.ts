import chalk from 'chalk';
import { Command, CommandOptions } from '../cli';
import { IsolatorExtension, ListResults } from '../isolator/isolator.extension';
import { loadConsumerIfExist } from '../../consumer';

export class CapsuleListCmd implements Command {
  name = 'capsule-list';
  description = `list all capsules`;
  shortDescription = 'list all capsules';
  group = 'capsules';
  private = true;
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorExtension) {}

  async getList(): Promise<ListResults> {
    // TODO: remove this consumer loading from here. it shouldn't be here
    const consumer = await loadConsumerIfExist();
    // TODO: throw a proper error instance
    if (!consumer) throw new Error('no consumer found');
    const results = await this.isolator.list(consumer);
    return results;
  }

  async report() {
    const list = await this.getList();
    // TODO: improve output
    return chalk.green(`found ${list.capsules.length} capsule(s) for workspace ${list.workspace}`);
  }

  async json() {
    const list = await this.getList();
    return list;
  }
}
