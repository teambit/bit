import { ComponentCapsule } from '../capsule-ext';

export class Script {
  constructor(
    /**
     * command to execute
     */
    private executable: string,

    /**
     * module path to execute. optional.
     */
    private modulePath?: string
  ) {}

  /**
   * execute the script on a given capsule
   * @param capsule capsule to execute on
   */
  async run(capsule: ComponentCapsule) {
    if (this.modulePath) return capsule.run(this.modulePath);
    return this.executeCmd(capsule);
  }

  /**
   * build a Script from a module
   */
  static module(modulePath: string, executable: string) {
    return new Script(executable, modulePath);
  }

  /**
   * build a Script from a raw command
   */
  static raw(cmd: string) {
    return new Script(cmd);
  }

  private async executeCmd(capsule: ComponentCapsule) {
    const exec = await capsule.exec({ command: this.executable.split(' ') });
    // eslint-disable-next-line no-console
    exec.stdout.on('data', chunk => console.log(chunk.toString()));
    // eslint-disable-next-line no-console
    exec.stderr.on('data', chunk => console.error(chunk.toString()));

    return new Promise(resolve => {
      exec.on('close', () => resolve());
    });
  }
}
