import { availableParallelism } from 'os';

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
    const body = Buffer.from(JSON.stringify({ kind: 'dependencyScan', request: JSON.parse(input) }));
    if (body.length > 4 * 1024 * 1024) throw new Error('workspace scanner input limit');
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(id, 4);
    header.writeUInt32BE(body.length, 8);
    const bytes = await this.engine.request(Buffer.concat([header, body]));
    if (bytes.length > 32 * 1024 * 1024) throw new Error('workspace scanner output limit');
    const response = JSON.parse(bytes.toString());
    if (
      response.version !== 1 ||
      response.id !== id ||
      response.failed ||
      !Array.isArray(response.skipped) ||
      response.skipped.length ||
      !Array.isArray(response.data?.files) ||
      response.completed !== response.data.files.length
    )
      throw new Error('workspace scanner declined');
    // Reuse the scanner protocol's full envelope, path and dependency validation.
    return Buffer.from(JSON.stringify(response.data) + '\n');
  }

  close(): void {
    this.engine.close();
  }
}
