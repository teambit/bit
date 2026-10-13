import { availableParallelism } from 'os';
import path from 'path';

type Engine = { request: (input: Buffer) => Promise<Buffer>; close: () => void };

/** Dependency extraction shares the VCS addon's bounded pool, with a private graph cache in the caller. */
export class RustScannerWorkspaceTransport {
  private readonly engine: Engine;
  constructor(addon: string, threads?: number) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const binding = require(addon) as { WorkspaceEngine: new (threads: number) => Engine };
    this.engine = new binding.WorkspaceEngine(Math.min(threads ?? Math.min(4, availableParallelism()), 8));
  }

  async request(input: string, id: number): Promise<Buffer> {
    const response = await this.operation({ kind: 'dependencyScan', request: JSON.parse(input) }, id);
    if (response.failed || !Array.isArray(response.data?.files) || response.completed !== response.data.files.length)
      throw new Error('workspace scanner declined');
    return Buffer.from(JSON.stringify(response.data) + '\n');
  }

  async resolve(
    filename: string,
    dependencies: string[],
    id: number,
    limits: { requestBytes: number; responseBytes: number }
  ): Promise<Array<string | null> | undefined> {
    const response = await this.operation(
      { kind: 'dependencyResolve', mode: 'commonjs', filename, dependencies },
      id,
      limits
    );
    if (response.failed) return undefined;
    const resolved = response.data?.resolved;
    if (
      !Array.isArray(resolved) ||
      resolved.length !== dependencies.length ||
      response.completed !== resolved.length ||
      !resolved.every(
        (file) =>
          file === null ||
          (typeof file === 'string' && path.isAbsolute(file) && file.length <= 32768 && !file.includes('\0'))
      )
    )
      throw new Error('workspace resolution protocol');
    return resolved;
  }

  private async operation(
    input: object,
    id: number,
    limits = { requestBytes: 4 * 1024 * 1024, responseBytes: 32 * 1024 * 1024 }
  ): Promise<any> {
    const body = Buffer.from(JSON.stringify(input));
    if (body.length > Math.min(limits.requestBytes, 4 * 1024 * 1024)) throw new Error('workspace scanner input limit');
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(id, 4);
    header.writeUInt32BE(body.length, 8);
    const bytes = await this.engine.request(Buffer.concat([header, body]));
    if (bytes.length > Math.min(limits.responseBytes, 32 * 1024 * 1024))
      throw new Error('workspace scanner output limit');
    const response = JSON.parse(bytes.toString());
    if (
      response.version !== 1 ||
      response.id !== id ||
      typeof response.failed !== 'boolean' ||
      !Array.isArray(response.skipped) ||
      response.skipped.length ||
      !Number.isSafeInteger(response.completed)
    )
      throw new Error('workspace scanner envelope');
    return response;
  }

  close(): void {
    this.engine.close();
  }
}
