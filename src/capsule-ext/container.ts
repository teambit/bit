import fs from 'fs-extra';
import _ from 'lodash';
import hash from 'object-hash';
import * as path from 'path';
import execa from 'execa';
import os from 'os';
import v4 from 'uuid';
import { Container, ExecOptions, Exec, ContainerStatus, Volume } from 'capsule';
import { ContainerFactoryOptions } from 'capsule/dist/capsule/container/container-factory';
import ContainerExec from './container-exec';

const debug = require('debug')('fs-container');

export interface BitExecOption extends ExecOptions {
  cwd: string;
}
export interface BitContainerConfig extends ContainerFactoryOptions {
  other?: string;
}

export default class FsContainer implements Container<Exec, Volume> {
  fs: Volume = new Volume();

  id = 'FS Container';
  path: string;
  config: any;
  constructor(config?: BitContainerConfig) {
    this.config = config;
    this.path = _.get(config, 'wrkDir');
    if (!this.path) this.path = this.generateDefaultTmpDir();
  }

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
      shell: false,
      cwd
    });
    subprocessP.stdout!.pipe(exec.stdout);
    subprocessP.stderr!.pipe(exec.stderr);
    const result = await subprocessP;
    exec.setStatus(result.exitCode);
    return exec;
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
