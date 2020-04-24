import { ReplaySubject } from 'rxjs';
import { EventEmitter } from 'events';
import { LogPublisher } from '../../logger';

// TODO: fix this hack by using the internal flow events
export const flowEvents = new EventEmitter();

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
        flowEvents.emit('flowStarted', flowData.id);
        // logPublisher.info(flowData.id, `***** started ${flowData.id} *****`);
      } else if (flowData.type === 'flow:result') {
        flowEvents.emit('flowExecuted', flowData.id);
        // logPublisher.info(flowData.id, `***** finished ${flowData.id} - duration:${flowData.duration} *****`);
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
