import { Script } from '../script';
import { ComponentCapsule } from '../../capsule-ext';

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
  run(capsule: ComponentCapsule) {
    this.scripts.forEach(script => script.run(capsule));

    return this;
  }
}
