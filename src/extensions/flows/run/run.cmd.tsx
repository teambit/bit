/* eslint-disable @typescript-eslint/no-unused-vars */
// :TODO make sure React is not an unused variable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { Command, CLIArgs } from '../../cli';
import { Flags, PaperOptions } from '../../paper/command';
import { Flows } from '../flows';
import { handleRunStream, flowEvents } from './handle-run-stream';
import { Report } from './report';
import { Reporter } from '../../reporter';
import { Logger, LogPublisher, LogEntry, LogLevel } from '../../logger';
import { onCapsuleInstalled, beforeInstallingCapsules } from '../../package-manager';

export class RunCmd implements Command {
  name = 'run <flow> [component...]';
  description =
    'increamantaly build any set of components with a configured build pipeline as defined in the component configuration. (builds new and modified components by default)';
  shortDescription = '';
  alias = '';
  group = '';
  options: PaperOptions = [
    ['p', 'parallel', 'specify the number of parallel flows to run.'],
    ['n', 'no-cache', 'Get execution result from cache if possibile.'],
    ['v', 'verbose', 'include stdout in screen']
  ];

  constructor(private flows: Flows, private reporter: Reporter, private logger: Logger) {}

  async render([flow, components]: CLIArgs, { parallel, noCache, verbose }: Flags) {
    let capsulesInstalled = 0;
    let totalCapsules = 0;
    let flowsExecuted = 0;
    let totalFlows = 0;
    let flowRunning = ''; // this is just a sample for the log because concurrency
    onCapsuleInstalled(componentName => {
      capsulesInstalled += 1;
      this.reporter.setStatusText(
        `Resolving Components from the workspace (${capsulesInstalled}/${totalCapsules}). ${componentName}`
      );
    });
    beforeInstallingCapsules(numCapsules => {
      totalCapsules += numCapsules;
    });
    flowEvents.on('flowStarted', flowName => {
      totalFlows += 1;
      flowRunning = flowName;
      this.reporter.setStatusText(`Running flows (${flowsExecuted}/${totalFlows}). Running ${flowRunning}`);
    });
    flowEvents.on('flowExecuted', flowName => {
      flowsExecuted += 1;
      this.reporter.setStatusText(`Running flows (${flowsExecuted}/${totalFlows}). Running ${flowRunning}`);
    });
    this.reporter.title(`Starting "${flow}"`);
    const concurrencyN = parallel && typeof parallel === 'string' ? Number.parseInt(parallel) : 5;
    const actualComps = typeof components === 'string' ? [components] : components;
    const comps = this.flows.getIds(actualComps);
    this.reporter.title('Setting up component execution');
    this.reporter.setStatusText(`Resolving Components from the workspace (${capsulesInstalled}/${totalCapsules}).`);
    this.flows.onWorkspaceLoaded(numComponents => {
      this.reporter.info(undefined, `V ${capsulesInstalled} Components resolved`);
      this.reporter.title('Executing flows');
      this.reporter.setStatusText('Executing flows');
    });
    const result = await this.flows.runStream(comps, flow as string, { concurrency: concurrencyN, caching: !noCache });

    // TODO: remove this hack once harmony gives us a solution for "own extension name" or something similar
    const logPublisher = this.logger.createLogPublisher('flows');

    // this.reporter.subscribe('flows');
    const report = await handleRunStream(result, logPublisher, verbose as boolean);
    this.reporter.info(undefined, `V ${flowsExecuted} Flows executed`);
    this.reporter.end();
    const reportComp = <Report props={report} />;
    return reportComp;
  }
}
