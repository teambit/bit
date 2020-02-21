import pMapSeries from 'p-map-series';
import pEvent from 'p-event';
import { Script } from '../script';
import { ComponentCapsule } from '../../capsule-ext';
import { PipeReporter } from '../walker/execution-reporter';

export class Pipe {
  constructor(
    /**
     * pipe's scripts.
     */
    readonly scripts: Script[] = []
  ) {}

  /**
   * runs a pipe of scripts on a given component capsule.
   * @param capsule component capsule to act on
   */
  async run(capsule: ComponentCapsule, reporter: PipeReporter) {
    // should perform caching -> SHOULD BE series and nor Promise.all
    const results = pMapSeries(this.scripts, async script => {
      const exec = await script.run(capsule);
      const messageResult = await pEvent(exec, 'message');
      // qballer, execResult has the childProcess you can pipe.
      const execResult = await this.waitForProcessToExit(exec);
      return messageResult;
    });

    // exec.stdout.pipe(reporter.out);
    // exec.stderr.pipe(reporter.err);
    // TODO: qballer - fix piping, not urgent for david.

    return results;
  }

  waitForProcessToExit(exec) {
    // eslint-disable-next-line prefer-rest-params
    return new Promise((resolve, reject) => {
      exec.stdout.on('close', () => {
        // eslint-disable-next-line prefer-rest-params
        return resolve(arguments[0]);
      });
      exec.stdout.on('data', data => {
        console.log('Got stdout from ChildProcess', data.toString());
      });
      exec.stdout.on('error', err => {
        return reject(err);
      });
      exec.stderr.on('error', err => {
        return reject(err);
      });
    });
  }
}
'[bidID]:internalModule/ninja/wow';
