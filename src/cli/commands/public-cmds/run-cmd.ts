import Command, { CommandOption } from '../../command';
import { run } from '../../../addons';
import { RunOptions } from '../../../addons/run-configuration';
export default class Run extends Command {
  name = 'run [step] [id]';
  description = `run a component activity in the capsule.`;
  //@ts-ignore
  opts = [
    ['e', 'extensions <extensions>', 'specify a list of extensions'],
    ['b', 'bail', 'exit when extension execution fails'],
    ['k', 'keep', 'should keep capsule after running']
  ];
  alias = '';
  loader = true;
  migration = true;
  action(stepInfo: [string, string], opts: any): Promise<any> {
    const step = stepInfo[0] || '';
    const id = stepInfo[1] || '';
    const extensions = opts.extensions ? opts.extension.trim.split(',').map(ext => ext.trim) : [];
    const bail = opts.bail || true;
    const keep = opts.keep || false;

    const config: RunOptions = {
      id,
      extensions,
      bail,
      keep,
      step
    };
    if (!config.step && !config.extensions.length) {
      console.log('must provide pipe name or extensions.');
      throw new Error('must provide pipe name or extensions.');
    }

    return run(config);
  }
  report(data: any, params: any, opts: { [key: string]: any }): string {
    debugger;
    return '';
  }
}
