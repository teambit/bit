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
  run(capsule: ComponentCapsule, reporter: PipeReporter) {
    // should perform caching -> SHOULD BE series and nor Promise.all
    return Promise.all(
      this.scripts.map(async function(script) {
        const exec = await script.run(capsule);

        // exec.stdout.pipe(reporter.out);
        // exec.stderr.pipe(reporter.err);

        // TODO: qballer - fix piping, not urgent for david.

        // eslint-disable-next-line prefer-rest-params
        return new Promise(resolve => {
          exec.on('close', function() {
            // eslint-disable-next-line prefer-rest-params
            // eslint-disable-next-line prefer-rest-params
            return resolve(arguments[0]);
          });
          // @ts-ignore
          exec.on('message', msg => {
            console.log('here', msg);
            return resolve(msg);
          });
        });
      })
    );
  }
}
'[bidID]:internalModule/ninja/wow';
