import { ReplaySubject } from 'rxjs';
import { Reporter } from '../../reporter';

export async function handleRunStream(stream: ReplaySubject<any>, reporter: Reporter) {
  const summary: { [k: string]: string } = {};
  const streamPromise = await new Promise(resolve =>
    stream.subscribe({
      next(networkData: any) {
        if (networkData instanceof ReplaySubject) {
          handleFlowStream(networkData, reporter, summary);
        } else if (networkData.type === 'network:start') {
          //
        } else if (networkData.type === 'network:result') {
          summary['network:result'] = networkData;
        } else {
          reporter.createLogger('run-infra').warn(`~~~~~~ Got ${networkData.type} on ${networkData.id}~~~~~~`);
        }
      },
      complete() {
        reporter.end();
        resolve(summary);
      },
      error() {
        reporter.end();
        resolve(summary);
      }
    })
  );

  return streamPromise;
}
function handleFlowStream(networkData: ReplaySubject<any>, reporter: Reporter, summery: any) {
  networkData.subscribe({
    next(flowData: any) {
      if (flowData.type === 'flow:start') {
        console.log('start-id:', flowData.id);
        reporter.createLogger(flowData.id).log(`***** started ${flowData.id} *****`);
      } else if (flowData.type === 'flow:result') {
        console.log('end-id:', flowData.id);
        reporter.createLogger(flowData.id).log(`***** finished ${flowData.id} - duration:${flowData.duration} *****`);
        summery[flowData.id] = flowData;
      } else if (flowData instanceof ReplaySubject) {
        handleTaskStream(flowData, reporter);
      }
    },
    error() {},
    complete() {}
  });
}

function handleTaskStream(taskStream: ReplaySubject<any>, reporter: Reporter) {
  taskStream.subscribe({
    next(data: any) {
      console.log('\ntask:', data.type);
      if (data.type === 'task:stdout') {
        reporter.createLogger(data.id).log(data.value);
      } else if (data.type === 'task:stderr') {
        reporter.createLogger(data.id).warn(data.value);
      }
    }
  });
}
