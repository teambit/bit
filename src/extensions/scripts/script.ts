/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { join } from 'path';
import { Exec } from '@teambit/capsule';
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
    // if (this.modulePath) return capsule.run(this.modulePath);
    return this.modulePath ? this.executeModule(capsule) : this.executeCmd(capsule);
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

  private async executeCmd(capsule: ComponentCapsule, executable = '') {
    const command = (executable || this.executable).split(' ');
    const exec: Exec = executable
      ? await capsule.execNode(command[0], command.slice(1))
      : await capsule.exec({ command });
    // eslint-disable-next-line no-console
    exec.stdout.on('data', chunk => console.log(chunk.toString()));
    // eslint-disable-next-line no-console
    exec.stderr.on('data', chunk => console.error(chunk.toString()));

    return new Promise(resolve => {
      exec.on('close', () => resolve());
    });
  }

  private async executeModule(capsule: ComponentCapsule) {
    const containerScriptName = '__bit-run-container.js';
    const pathToTask = this.modulePath!.startsWith('/') ? this.modulePath!.slice(1) : this.modulePath;
    const containerScript = `
      const userTask = require('${pathToTask}')
      const toExecute = userTask['default']
      if (typeof toExecute === 'function') {
        toExecute()
      }
    `;
    try {
      capsule.fs.writeFileSync(containerScriptName, containerScript);
      await this.executeCmd(capsule, containerScriptName);
    } finally {
      capsule.fs.unlinkSync(containerScriptName);
    }
  }
}
