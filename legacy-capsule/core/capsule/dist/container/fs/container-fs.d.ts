import Container from '../container';
import { PathLike, WriteFileOptions } from 'fs';
export default class ContainerVolume {
  private container;
  constructor(container: Container);
  private readArchive;
  private putArchive;
  readFile(
    path: PathLike,
    options:
      | {
          encoding?: null;
          flag?: string;
        }
      | undefined
      | null,
    callback: (err?: NodeJS.ErrnoException, data?: Buffer) => void
  ): void;
  writeFile(path: PathLike | number, data: any, options: WriteFileOptions, cb?: Function): Promise<void>;
  static fromJSON(
    container: Container,
    json?: {
      [path: string]: string;
    }
  ): ContainerVolume;
}
