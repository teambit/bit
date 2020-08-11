import Container from '../container';
import { PathLike, WriteFileOptions } from 'fs';

export default class ContainerVolume {
  constructor(private container: Container) {}

  private readArchive(path: PathLike): Promise<Buffer> {
    return this.container.get({ path: path.toString() }).then((stream) => {
      let body = '';
      stream.on('data', (chunk) => {
        body += chunk;
      });

      return new Buffer(body);
    });
  }

  private async putArchive(path: PathLike, contents: string): Promise<any> {
    const object: { [path: string]: string } = {};
    object[path.toString()] = contents;
    return this.container.put(object, { path: '/capsule' });
  }

  readFile(
    path: PathLike,
    options: { encoding?: null; flag?: string } | undefined | null,
    callback: (err?: NodeJS.ErrnoException, data?: Buffer) => void
  ): void {
    this.readArchive(path)
      .then((contents) => callback(undefined, contents))
      .catch((err) => callback(err));
  }

  async writeFile(path: PathLike | number, data: any, options: WriteFileOptions, cb?: Function): Promise<void> {
    return this.putArchive(path.toString(), data).then(() => {
      if (cb) return cb();
      return;
    });
  }

  static fromJSON(container: Container, json?: { [path: string]: string }): ContainerVolume {
    const volume = new ContainerVolume(container);
    if (!json) return volume;

    return volume;
  }
}
