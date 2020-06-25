import { Command, CommandOptions } from '../cli';
import { Workspace } from '../workspace';
import { BuilderExtension } from './builder.extension';
import { Reporter } from '../reporter';
import { onCapsuleInstalled, beforeInstallingCapsules } from '../dependency-resolver/package-manager';

export class BuilderCmd implements Command {
  name = 'run-new [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = '';
  private = true;
  shortDescription = '';
  options = [['v', 'verbose', 'print log stdout to the screen']] as CommandOptions;

  constructor(private builder: BuilderExtension, private workspace: Workspace, private reporter: Reporter) {}

  async report([userPattern]: [string], { verbose }: { verbose: boolean }): Promise<string> {
    this.reporter.title('Starting "build"');
    let capsulesInstalled = 0;
    let totalCapsules = 0;
    onCapsuleInstalled(componentName => {
      capsulesInstalled += 1;
      this.reporter.setStatusText(
        `⏳ Resolving Components from the workspace (${capsulesInstalled}/${totalCapsules}). ${componentName}`
      );
    });
    beforeInstallingCapsules(numCapsules => {
      totalCapsules += numCapsules;
    });

    const pattern = userPattern && userPattern.toString();
    this.reporter.title('Loading components');
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();
    this.reporter.title('🎬  Executing build');
    this.reporter.setStatusText('⏳ Executing build');
    if (verbose) {
      this.reporter.subscribeAll();
    }
    const results = await this.builder.build(components);
    // @todo: decide about the output
    results.forEach((
      result // eslint-disable-next-line no-console
    ) => console.log('result', `Env: ${result.env}\nResult: ${JSON.stringify(result.res, undefined, 2)}`));
    this.reporter.end();

    return `compiled ${results.length} components successfully`;
  }
}
