const { PnpmScriptTask } = require('./pnpm-script.task');
const { PnpmWorkspaceCompiler } = require('./pnpm-workspace.compiler');

/**
 * the env of the packages of a pnpm workspace adopted by "bit pnpm sync". it has no tooling of its
 * own: compiling, building, testing and linting run the packages' own package.json scripts, with
 * pnpm, across the whole workspace.
 *
 * plain javascript with no dependencies, so it runs as source: it needs no env to compile it, and
 * nothing to install beyond itself. bit's own aspects are reached through the env context.
 */
class PnpmWorkspaceEnv {
  constructor() {
    this.name = 'pnpm-workspace';
    this.icon = 'https://static.bit.dev/extensions-icons/default.svg';
  }

  compiler() {
    return (context) => new PnpmWorkspaceCompiler(context);
  }

  /** a pipeline as the builder reads one: tasks computed for the env's context */
  build() {
    return {
      compute: (context) => ['build', 'test', 'lint'].map((script) => PnpmScriptTask.create(script, context)),
    };
  }
}

exports.PnpmWorkspaceEnv = PnpmWorkspaceEnv;
exports.default = new PnpmWorkspaceEnv();
