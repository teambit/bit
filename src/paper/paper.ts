import { Command } from './command';
import { BitCli } from '../cli';
import CommandRegistry from './registry';
import commander from 'commander';
import { render } from 'ink';
import { execAction } from '../cli/command-registry';
import R from 'ramda';
export default class Paper {
  constructor(
    /**
     * paper's command registry
     */
    private registry: CommandRegistry
  ) {}

  /**
   * registers a new command in to `Paper`.
   */
  register(command: Command) {
    this.registry.register(command);
    return this;
  }

  /**
   * list of all registered commands.
   */
  get commands() {
    return this.registry.commands;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   *
   */
  async run(): Promise<void> {
    // TODO: Implement this to wrap the legacy CLI (code smell)
    Object.entries(this.commands).reduce(function(accum, [key, paperCommand]) {
      const commanderCMD = accum
        .command(paperCommand.name)
        .description(paperCommand.description)
        .alias(paperCommand.alias);

      paperCommand.options.forEach(function(opt) {
        commanderCMD.option(opt[0], opt[1], opt[2]);
      });

      commanderCMD.action(async function(args) {
        console.log('args', args);
        console.log(arguments);
        const toRender = await execAction(paperCommand, commanderCMD, args);
      });

      return accum;
    }, commander);
    const [params, packageManagerArgs] = R.splitWhen(R.equals('--'), process.argv);
    commander.packageManagerArgs = packageManagerArgs;
    commander.parse(params);
  }
}
