import { expect } from 'chai';
import { logger } from '@teambit/legacy.logger';
import type { Command, CommandOptions } from './command';
import { CLIParser } from './cli-parser';

class SubCmd implements Command {
  name = 'sub <arg>';
  description = 'a sub command';
  options = [
    ['f', 'force', 'force it'],
    // the parent declares "remote" as a flag that takes a value. this one is a boolean, so the
    // parent's must not reach here, otherwise yargs demands a value that was never meant to exist.
    ['r', 'remote', 'a boolean here, unlike the parent'],
  ] as CommandOptions;
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
    ['r', 'remote <scope-name>', 'a flag that takes a value'],
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

    it('accepts a value for a parent flag that takes one', async () => {
      const runner = await parse(['parent', '--remote', 'my-scope']);

      expect(flagsOf(runner).remote).to.equal('my-scope');
    });

    it('does not leak the parent flags into a sub-command that declares the same name', async () => {
      // the parent's "remote" takes a value while the sub-command's is a boolean. if the parent's
      // is registered globally it shadows the sub-command's, and yargs rejects the next token as a
      // missing value: `Not enough arguments following: remote`.
      const runner = await parse(['parent', 'sub', 'some-arg', '--remote', '--force']);

      expect(flagsOf(runner).remote).to.be.true;
      expect(flagsOf(runner).force).to.be.true;
      expect(argsOf(runner)[0]).to.equal('some-arg');
    });
  });
});
