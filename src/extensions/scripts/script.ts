/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Exec } from '@teambit/capsule';
import { ComponentCapsule } from '../capsule/component-capsule';

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
      ? await capsule.execNode(command[0], { args: command.slice(1), stdio: [null, null, null, 'ipc'] })
      : await capsule.exec({ command });

    return exec;
  }

  private async executeModule(capsule: ComponentCapsule) {
    const containerScriptName = '__bit-run-container.js';
    const pathToTask = this.modulePath!.startsWith('/') ? this.modulePath!.slice(1) : this.modulePath;
    // @todo: currently it only runs when the script file has default export or module.exports
    // we probably want to support a specific function on the script as well
    const containerScript = `
const userTask = require('${pathToTask}')
const toExecute = userTask.default || userTask;
if (typeof toExecute === 'function') {
  const getPromiseResults = () => {
    const executed = toExecute();
    return executed && executed.then ? executed : Promise.resolve(executed);
  };
  getPromiseResults().then(userTaskResult => {
    process.on('beforeExit', (code) => {
      const toSend = userTaskResult || { exitCode: code };
      process.send && process.send(toSend);
    });
  });
}
    `;
    try {
      capsule.fs.writeFileSync(containerScriptName, containerScript, { encoding: 'utf8' });
      return this.executeCmd(capsule, containerScriptName);
    } finally {
      // todo: this is commented out because the script is running on a later phase, so the file
      // must be there. Also, for debugging purposes it's probably better to leave the file. (david).
      // capsule.fs.unlinkSync(containerScriptName);
    }
  }
}
