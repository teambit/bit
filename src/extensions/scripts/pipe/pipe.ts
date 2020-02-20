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
    // should perform caching
    return Promise.all(
      this.scripts.map(async script => {
        const exec = await script.run(capsule);
        exec.stdout.pipe(reporter.out);
        exec.stderr.pipe(reporter.err);

        // eslint-disable-next-line prefer-rest-params
        // @ts-ignore
        return new Promise(resolve =>
          exec.on('message', msg => {
            console.log('here');
            return resolve(JSON.parse(msg));
          })
        );
      })
    );
  }
}
