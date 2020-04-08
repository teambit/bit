import { ReplaySubject } from 'rxjs';
import { Reporter } from '../../reporter';

export async function handleRunStream(stream: ReplaySubject<any>, reporter: Reporter, verbose: boolean) {
  const summary: { [k: string]: string } = {};
  const streamPromise = await new Promise(resolve =>
    stream.subscribe({
      next(networkData: any) {
        if (networkData instanceof ReplaySubject) {
          handleFlowStream(networkData, reporter, summary, verbose);
        } else if (networkData.type === 'network:start') {
          //
        } else if (networkData.type === 'network:result') {
          summary['network:result'] = networkData;
        } else {
          reporter.createLogger('run-infra').warn(`~~~~~~ Got ${networkData.type} on ${networkData.id}~~~~~~`);
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
function handleFlowStream(networkData: ReplaySubject<any>, reporter: Reporter, summery: any, verbose: boolean) {
  networkData.subscribe({
    next(flowData: any) {
      if (flowData.type === 'flow:start') {
        reporter.createLogger(flowData.id).info(`***** started ${flowData.id} *****`);
      } else if (flowData.type === 'flow:result') {
        reporter.createLogger(flowData.id).info(`***** finished ${flowData.id} - duration:${flowData.duration} *****`);
        summery[flowData.id] = flowData;
      } else if (flowData instanceof ReplaySubject) {
        handleTaskStream(flowData, reporter, verbose);
      }
    },
    error() {},
    complete() {}
  });
}

function handleTaskStream(taskStream: ReplaySubject<any>, reporter: Reporter, verbose: boolean) {
  taskStream.subscribe({
    next(data: any) {
      if (data.type === 'task:stdout' && verbose) {
        reporter.createLogger(data.id).info(data.value);
      } else if (data.type === 'task:stderr') {
        reporter.createLogger(data.id).warn(data.value);
      }
    }
  });
}
