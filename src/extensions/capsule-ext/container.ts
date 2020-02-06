import fs from 'fs-extra';
import _ from 'lodash';
import hash from 'object-hash';
import * as path from 'path';
import execa from 'execa';
import os from 'os';
import v4 from 'uuid';
import { Container, ExecOptions, Exec, ContainerStatus, ContainerFactoryOptions } from '@teambit/capsule';
import { AnyFS, NodeFS } from '@teambit/any-fs';
import { Stream } from 'stream';
import ContainerExec from './container-exec';

const debug = require('debug')('fs-container');

export interface BitExecOption extends ExecOptions {
  cwd: string;
  stdio?: 'pipe' | 'ipc' | 'ignore' | 'inherit' | Stream | number | undefined;
}
export interface BitContainerConfig extends ContainerFactoryOptions {
  other?: string;
}

export default class FsContainer implements Container<Exec, AnyFS> {
  id = 'FS Container';

  get path() {
    let p = _.get(this.config, 'wrkDir');
    if (!p) p = this.generateDefaultTmpDir();
    return p;
  }

  fs: AnyFS = new NodeFS(this.path);

  constructor(readonly config: any) {}

  public getPath() {
    return this.path;
  }

  private composePath(pathToCompose) {
    return path.join(this.getPath(), pathToCompose);
  }

  private generateDefaultTmpDir() {
    if (this.config.bitId) {
      return path.join(os.tmpdir(), `${this.config.bitId.toString()}_${hash(this.config)}`);
    }
    // backword capsule support - remove
    return path.join(os.tmpdir(), v4());
  }

  outputFile(file, data, options) {
    const filePath = this.composePath(file);
    debug(`writing file on ${filePath}`);
    return fs.outputFile(filePath, data, options);
  }

  removePath(dir: string): Promise<any> {
    const pathToRemove = this.composePath(dir);
    return fs.remove(pathToRemove);
  }

  async symlink(src: string, dest: string): Promise<any> {
    const srcPath = this.composePath(src);
    const destPath = this.composePath(dest);
    await fs.ensureDir(path.dirname(destPath));
    return fs.ensureSymlink(srcPath, destPath);
  }

  async exec(execOptions: BitExecOption): Promise<ContainerExec> {
    const cwd = execOptions.cwd ? this.composePath(execOptions.cwd) : this.getPath();
    debug(`executing the following command: ${execOptions.command.join(' ')}, on cwd: ${cwd}`);
    const exec = new ContainerExec();
    const subprocessP = execa.command(execOptions.command.join(' '), {
      shell: true,
      cwd
    });

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    subprocessP.stdout!.pipe(exec.stdout);
    subprocessP.stderr!.pipe(exec.stderr);
    subprocessP.on('close', function(statusCode) {
      exec.setStatus(statusCode);
    });
    return exec;
  }

  execP(execOptions: BitExecOption): Promise<string> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let hasError = false;
      const exec = await this.exec(execOptions);
      exec.stdout.on('error', () => {
        hasError = true;
      });
      exec.on('close', () => {
        if (hasError) reject(exec.stderr.getContents!(exec.stderr.size).toString());
        resolve(exec.stdout.getContents!(exec.stdout.size).toString());
      });
    });
  }

  async terminal() {
    const cwd = this.getPath();
    return execa.command(process.env.SHELL || '/bin/zsh', { cwd, stdio: 'inherit' });
  }

  start(): Promise<void> {
    return fs.ensureDir(this.path);
  }
  // @ts-ignore
  async inspect(): Promise<ContainerStatus> {
    // todo: probably not needed for this container
  }
  async pause(): Promise<void> {
    // do nothing
  }
  async resume(): Promise<void> {
    // do nothing
  }
  // eslint-disable-next-line
  stop(ttl?: number | undefined): Promise<void> {
    return fs.remove(this.path);
  }
  async destroy(): Promise<void> {
    await this.stop();
  }
  log(): Promise<Exec> {
    throw new Error('Method not implemented.');
  }
  on(event: string, fn: (data: any) => void): void {
    return fn(event);
    // throw new Error('Method not implemented.');
  }
}
