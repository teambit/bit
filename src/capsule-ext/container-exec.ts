import { Exec, ExecStatus } from 'capsule';
import { EventEmitter } from 'events';
import DuplexBufferStream from 'capsule/dist/utils/duplex-buffer-stream';

export default class ContainerExec extends EventEmitter implements Exec {
  constructor(private _code: number = 0) {
    super();
  }

  stdout: DuplexBufferStream = new DuplexBufferStream();
  stderr: DuplexBufferStream = new DuplexBufferStream();
  stdin: DuplexBufferStream = new DuplexBufferStream();

  setStatus(status: number): void {
    this._code = status;
    this.emit('close');
  }

  get code(): number {
    return this._code;
  }

  inspect(): Promise<ExecStatus> {
    return Promise.resolve({
      running: true,
      pid: 1
    });
  }
  abort(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
