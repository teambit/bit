import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { sourceSignature } from './pnpm-workspace.compiler';

describe('sourceSignature', () => {
  let workspaceDir: string;
  const write = (relativePath: string, contents: string) =>
    fs.outputFile(path.join(workspaceDir, relativePath), contents);
  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnpm-signature-'));
    await write('pkg/package.json', '{}');
    await write('pkg/src/lib/util.ts', 'export const a = 1;');
    await write('pkg/dist/index.js', 'old');
  });
  afterEach(() => fs.remove(workspaceDir));

  it('changes when a source in a dir named as an output dir changes, e.g. src/lib', async () => {
    const before = await sourceSignature(workspaceDir);
    await write('pkg/src/lib/util.ts', 'export const a = 22;');
    expect(await sourceSignature(workspaceDir)).to.not.equal(before);
  });
  it('stays when only the output next to a package.json changes', async () => {
    const before = await sourceSignature(workspaceDir);
    await write('pkg/dist/index.js', 'new output');
    expect(await sourceSignature(workspaceDir)).to.equal(before);
  });
});
