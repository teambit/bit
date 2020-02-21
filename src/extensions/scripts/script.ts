/* eslint-disable @typescript-eslint/no-non-null-assertion */
// import { join } from 'path';
import { join } from 'path';
import { writeFileSync } from 'fs';
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
    console.log('script.run');
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
    // const exec: Exec = executable
    //   ? await capsule.execNode(command[0], { args: command.slice(1), stdio: ['ipc'] })
    //   : await capsule.exec({ command });
    const exec: Exec = executable
      ? await capsule.execNode(command[0], { args: command.slice(1), stdio: [null, null, null, 'ipc'] })
      : await capsule.exec({ command });

    return exec;
  }

  private async executeModule(capsule: ComponentCapsule) {
    const containerScriptName = '__bit-run-container.js';
    const pathToTask = this.modulePath!.startsWith('/') ? this.modulePath!.slice(1) : this.modulePath;
    const containerScript = `
const userTask = require('${pathToTask}')
const toExecute = userTask.default || userTask;
if (typeof toExecute !== 'function') {
  throw new Error('script "${pathToTask}" has no default function to run');
}
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
    `;
    try {
      capsule.fs.writeFileSync(containerScriptName, containerScript, { encoding: 'utf8' });
      return this.executeCmd(capsule, containerScriptName);
    } finally {
      // capsule.fs.unlinkSync(containerScriptName);
    }
  }
}

// compiler
