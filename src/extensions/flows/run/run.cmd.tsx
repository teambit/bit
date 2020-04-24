/* eslint-disable @typescript-eslint/no-unused-vars */
// :TODO make sure React is not an unused variable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { ReplaySubject } from 'rxjs';
import { Command, CLIArgs } from '../../cli';
import { Flags, PaperOptions } from '../../paper/command';
import { Flows } from '../flows';
import { reportRunStream } from './handle-run-stream';
import { Report } from './report';
import { Reporter } from '../../reporter';
import { Logger, LogPublisher } from '../../logger';
import { flattenReplaySubject, flattenNestedMap } from '../util/flatten-nested-map';

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

  constructor(private flows: Flows, private reporter: Reporter, private logger: Logger) {}

  async render([flow, components]: CLIArgs, { parallel, noCache, verbose }: Flags) {
    this.reporter.title(`Starting "${flow}"`);
    const concurrencyN = parallel && typeof parallel === 'string' ? Number.parseInt(parallel) : 5;
    const actualComps = typeof components === 'string' ? [components] : components;
    const comps = this.flows.getIds(actualComps);
    this.reporter.title('Setting up component execution');
    this.reporter.setStatusText('Resolving Components from the workspace ([COUNTER-TBD])...');
    this.flows.onWorkspaceLoaded(numComponents => {
      this.reporter.info(undefined, `V ${numComponents} Components resolved`);
      this.reporter.title('Executing flows');
      this.reporter.setStatusText('[COUNTER-TBD] Components remaining. Running');
    });
    const runStream: ReplaySubject<any> = await this.flows.runStream(comps, flow as string, {
      concurrency: concurrencyN,
      caching: !noCache
    });
    // TODO: remove this hack once harmony gives us a solution for "own extension name" or something similar
    const logPublisher = this.logger.createLogPublisher('flows');

    const report = await reportRunStream(runStream, logPublisher, verbose as boolean);
    this.reporter.end();
    const reportComp = <Report props={report} />;
    return reportComp;
  }
}

export async function handleRunStream(stream: ReplaySubject<any>, logPublisher: LogPublisher, verbose: boolean) {
  const summary: { [k: string]: string } = {};
  const streamPromise = await new Promise(resolve =>
    stream.subscribe({
      next(networkData: any) {
        if (networkData instanceof ReplaySubject) {
          handleFlowStream(networkData, logPublisher, summary, verbose);
        } else if (networkData.type === 'network:start') {
          //
        } else if (networkData.type === 'network:result') {
          summary['network:result'] = networkData;
        } else {
          logPublisher.warn('run-infra', `~~~~~~ Got ${networkData.type} on ${networkData.id}~~~~~~`);
        }
      },
      complete() {
        resolve(summary);
      },
      error() {
        resolve(summary);
      }
    })
  );

  return streamPromise;
}
function handleFlowStream(networkData: ReplaySubject<any>, logPublisher: LogPublisher, summery: any, verbose: boolean) {
  networkData.subscribe({
    next(flowData: any) {
      if (flowData.type === 'flow:start') {
        logPublisher.info(flowData.id, `***** started ${flowData.id} *****`);
      } else if (flowData.type === 'flow:result') {
        logPublisher.info(flowData.id, `***** finished ${flowData.id} - duration:${flowData.duration} *****`);
        summery[flowData.id] = flowData;
      } else if (flowData instanceof ReplaySubject) {
        handleTaskStream(flowData, logPublisher, verbose);
      }
    },
    error() {},
    complete() {}
  });
}

function handleTaskStream(taskStream: ReplaySubject<any>, logPublisher: LogPublisher, verbose: boolean) {
  taskStream.subscribe({
    next(data: any) {
      if (data.type === 'task:stdout' && verbose) {
        logPublisher.info(data.id, data.value);
      } else if (data.type === 'task:stderr') {
        logPublisher.warn(data.id, data.value);
      }
    }
  });
}
