import { Duplex } from 'stream';

export default class Console {
  constructor(private stdout: NodeJS.WritableStream = new Duplex()) // private stdin: Stream =
  {}

  getStdout() {
    return this.stdout;
  }

  on() {}
}
