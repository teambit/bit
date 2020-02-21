import pMapSeries from 'p-map-series';
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
      return this.runExec(exec);
    });

    // exec.stdout.pipe(reporter.out);
    // exec.stderr.pipe(reporter.err);
    // TODO: qballer - fix piping, not urgent for david.

    return results;
  }

  runExec(exec) {
    // eslint-disable-next-line prefer-rest-params
    return new Promise((resolve, reject) => {
      exec.stdout.on('close', () => {
        // eslint-disable-next-line prefer-rest-params
        return resolve(arguments[0]);
      });
      exec.stdout.on('data', data => {
        console.log('Got stdout from ChildProcess', data.toString());
      });
      // @ts-ignore
      exec.on('message', msg => {
        console.log('Got Message from childProcess', msg);
        return resolve(msg);
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
