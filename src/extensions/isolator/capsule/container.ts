import fs from 'fs-extra';
import * as path from 'path';
import execa from 'execa';
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

  fs: NodeFS = new NodeFS(this.wrkDir);

  constructor(readonly wrkDir: string) {}

  // TODO: do we need this?
  public getPath() {
    return this.wrkDir;
  }

  private composePath(pathToCompose) {
    return path.join(this.getPath(), pathToCompose);
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

  async exec(execOptions: BitExecOption, exec = new ContainerExec()): Promise<ContainerExec> {
    const cwd = execOptions.cwd ? this.composePath(execOptions.cwd) : this.getPath();
    debug(`executing the following command: ${execOptions.command.join(' ')}, on cwd: ${cwd}`);
    const subprocessP = execa.command(execOptions.command.join(' '), {
      shell: true,
      cwd,
      stdio: ['ipc']
    });

    subprocessP.on('message', function(msg: any) {
      exec.emit('message', msg);
    });
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    subprocessP.stderr?.pipe(exec.stderr);
    subprocessP.stdout?.pipe(exec.stdout);
    ['close', 'exit'].forEach(function(eventName: string) {
      subprocessP.on(eventName, function(statusCode) {
        exec.setStatus(statusCode);
      });
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
    return fs.ensureDir(this.wrkDir);
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
    return fs.remove(this.wrkDir);
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
