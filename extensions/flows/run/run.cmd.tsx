/* eslint-disable @typescript-eslint/no-unused-vars */
// :TODO make sure React is not an unused variable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Command, CLIArgs } from '../../cli';
import { Flags, PaperOptions } from '../../paper/command';
import { Flows } from '../flows';
import { handleRunStream } from './handle-run-stream';
import { Report } from './report';
import { Reporter } from '../../reporter';

export class RunCmd implements Command {
  name = 'run <flow> [component...]';
  description =
    'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';

  // @ts-ignore
  options: PaperOptions = [
    ['p', 'parallel', 'specify the number of parallel flows to run.'],
    ['n', 'no-cache', 'Get execution result from cache if possibile.'],
    ['v', 'verbose', 'include stdout in screen']
  ];

  constructor(private flows: Flows, private reporter: Reporter) {}

  async render([flow, components]: CLIArgs, { parallel, noCache, verbose }: Flags) {
    this.reporter.title(`Starting "${flow}"`);
    const concurrencyN = parallel && typeof parallel === 'string' ? Number.parseInt(parallel) : 5;
    const actualComps = typeof components === 'string' ? [components] : components;
    const comps = this.flows.getIds(actualComps);
    this.reporter.title('Setting up component execution');
    this.reporter.setStatusText('Resolving Components from the workspace ([COUNTER-TBD])...');
    this.flows.onWorkspaceLoaded(numComponents => {
      this.reporter.info(`V ${numComponents} Components resolved`);
      this.reporter.title('Executing flows');
      this.reporter.setStatusText('[COUNTER-TBD] Components remaining. Running');
    });
    const result = await this.flows.runStream(comps, flow as string, { concurrency: concurrencyN, caching: !noCache });

    const report = await handleRunStream(result, this.reporter, verbose as boolean);
    this.reporter.end();
    const reportComp = <Report props={report} />;
    return reportComp;
  }
}
