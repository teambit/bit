import { Extension } from "../..";
import { CLI, Command } from '../cli';

// @Extension()
export class BaseCompiler {
  constructor(
    private cli: CLI
  ) {}

  // @Config()
  config() {
    return {
      cjs: 'blue/green'
    };
  }

  // @Command
  main() {
    return {
      synopsis: 'compile <id>',
      report: () => {
        return 'compiled in 0.1 secs';
      }
    };
  }

  compile() {
    this.cli.run();
    return 'hello world';
  }
}
