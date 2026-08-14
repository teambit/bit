import { expect } from 'chai';
import { logger } from '@teambit/legacy.logger';
import type { Command, CommandOptions } from './command';
import { CLIParser } from './cli-parser';

class SubCmd implements Command {
  name = 'sub <arg>';
  description = 'a sub command';
  options = [['f', 'force', 'force it']] as CommandOptions;
  group = 'general';
  async report() {
    return '';
  }
}

class ParentCmd implements Command {
  name = 'parent [pattern]';
  description = 'a command that also has sub commands';
  options = [
    ['j', 'json', 'return the output in json format'],
    ['d', 'details', 'show more details'],
  ] as CommandOptions;
  group = 'general';
  commands: Command[] = [new SubCmd()];
  async report() {
    return '';
  }
}

function parse(args: string[]) {
  const parser = new CLIParser([new ParentCmd()], {} as any, { values: () => [] } as any);
  return parser.parse(args);
}

function flagsOf(runner: any): Record<string, any> {
  return runner.flags;
}

function argsOf(runner: any): any[] {
  return runner.args;
}

describe('CLIParser', () => {
  let isDaemon: boolean;
  before(() => {
    // a parse failure exits the process unless the logger is in daemon mode, in which case it
    // throws instead. without this, a regression here would kill the test run rather than fail it.
    isDaemon = logger.isDaemon;
    logger.isDaemon = true;
  });
  after(() => {
    logger.isDaemon = isDaemon;
  });

  describe('a command that has sub-commands', () => {
    it('accepts the parent command own flags', async () => {
      // registering sub-commands replaces the builder that declares the parent's own flags. when
      // that is not accounted for, yargs strict mode rejects them as unknown arguments.
      const runner = await parse(['parent', 'some-pattern', '--json']);

      expect(flagsOf(runner).json).to.be.true;
      expect(argsOf(runner)[0]).to.equal('some-pattern');
    });

    it('accepts the parent command own flags by their alias', async () => {
      const runner = await parse(['parent', '-d']);

      expect(flagsOf(runner).details).to.be.true;
    });

    it('still routes to a sub-command and accepts its flags', async () => {
      const runner = await parse(['parent', 'sub', 'some-arg', '--force']);

      expect(flagsOf(runner).force).to.be.true;
      expect(argsOf(runner)[0]).to.equal('some-arg');
    });

    it('keeps the global flags available on the parent command', async () => {
      const runner = await parse(['parent', '--log=error']);

      expect(flagsOf(runner).log).to.equal('error');
    });
  });
});
