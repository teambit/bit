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
    [
      'c',
      'concurrency',
      'specify the number of concurrent build processes for Bit to run. default value depends on the operating system and the number of available CPU cores.'
    ]
  ];

  constructor(private flows: Flows, private reporter: Reporter) {}

  async render([flow, components]: CLIArgs, { concurrency }: Flags) {
    const concurrencyN = concurrency && typeof concurrency === 'string' ? Number.parseInt(concurrency) : 5;
    const actualComps = typeof components === 'string' ? [components] : components;
    const comps = this.flows.getIds(actualComps);
    const result = await this.flows.runStream(comps, 'build', { concurrency: concurrencyN });
    this.reporter.end();
    this.reporter.startPhase('network');

    const report = await handleRunStream(result, this.reporter);
    const reportComp = <Report props={report} />;
    this.reporter.end();
    return reportComp;
  }
}
