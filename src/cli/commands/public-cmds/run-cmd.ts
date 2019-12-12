import Command, { CommandOption } from '../../command';

export default class Run extends Command {
  name = 'run pipe [ids...]';
  description = `run a component activity in the capsule.`;
  opts: CommandOption[] = [
    ['e', 'extension ', 'specify a list of extensions'],
    ['b', 'bail', 'exit when extension execution fails'],
    ['k', 'keep', 'should keep capsule after running']
  ];
  loader = true;
  migration = true;

  action(): Promise<any> {
    return Promise.resolve();
  }
}
