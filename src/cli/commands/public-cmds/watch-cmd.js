/** @flow */
import Command from '../../command';
import { watchInlineComponents } from '../../../api/consumer';

export default class Create extends Command {
  name = 'watch';
  description = 'watch the inline_components directory and perform `build -i` on changes';
  alias = 'w';
  opts = [];

  action(): Promise<*> {
    return watchInlineComponents();
  }

  report(): string {
    return 'watcher terminated';
  }
}
