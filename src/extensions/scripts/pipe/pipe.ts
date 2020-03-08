import pMapSeries from 'p-map-series';
import { Script } from '../script';
import { Capsule } from '../../isolator/capsule';
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
  async run(capsule: Capsule, reporter: PipeReporter) {
    // should perform caching -> SHOULD BE series and nor Promise.all
    const results = pMapSeries(this.scripts, async (script: Script) => {
      const exec = await script.run(capsule);
      const execResult = await this.waitForProcessToExit(exec);
      return execResult;
    });

    // exec.stdout.pipe(reporter.out);
    // exec.stderr.pipe(reporter.err);
    // TODO: qballer - fix piping

    return results;
  }

  waitForProcessToExit(exec) {
    let message = {};
    // eslint-disable-next-line prefer-rest-params
    return new Promise((resolve, reject) => {
      exec.stdout.on('close', () => {
        // eslint-disable-next-line prefer-rest-params
        return resolve(message);
      });
      exec.on('message', (msg: any) => {
        console.log('Got Message from ChildProcess', msg);
        // this is the return value of the script function running on the capsule
        message = msg;
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
      exec.stderr.on('data', err => {
        console.log('Got stderr from ChildProcess', err.toString());
      });
    });
  }
}
