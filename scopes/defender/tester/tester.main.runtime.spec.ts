import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component';
import type { Component } from '@teambit/component';
import { TestsResult, TestsFiles } from '@teambit/tests-results';
import type { EnvsMain } from '@teambit/envs';
import { TesterMain } from './tester.main.runtime';
import type { TestResults } from './tester.main.runtime';

function mkResults(): TestResults {
  const componentId = ComponentID.fromString('my-scope/button');
  const files = [new TestsFiles('button.spec.ts', [], 1, 0, 0, 0, false)];
  return {
    results: [
      {
        env: { id: 'my-org.my-scope/my-env' },
        data: { components: [{ componentId, results: new TestsResult(files, true, 0) }] },
      },
    ],
    errors: [],
  } as unknown as TestResults;
}

function mkTester(calls: string[]) {
  const results = mkResults();
  const envsRuntime = {
    run: async () => {
      calls.push('run');
      return results;
    },
    runEnv: async () => {
      calls.push('runEnv');
      return results;
    },
  };
  const envs = { createEnvironment: async () => envsRuntime } as unknown as EnvsMain;
  const args = [[], undefined, envs, undefined, {}, undefined, undefined, undefined] as unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (TesterMain as any)(...args) as TesterMain;
}

describe('TesterMain.test() junit report', () => {
  let tmpDir: string;
  const components = [] as Component[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tester-junit-'));
  });
  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('writes the junit file when only junit is provided', async () => {
    const calls: string[] = [];
    const junit = path.join(tmpDir, 'results.xml');
    await mkTester(calls).test(components, { junit } as any);
    expect(calls).to.deep.equal(['run']);
    expect(await fs.pathExists(junit)).to.be.true;
  });

  it('writes the junit file when both env and junit are provided', async () => {
    const calls: string[] = [];
    const junit = path.join(tmpDir, 'results.xml');
    await mkTester(calls).test(components, { env: 'my-org.my-scope/my-env', junit } as any);
    expect(calls).to.deep.equal(['runEnv']);
    const content = await fs.readFile(junit, 'utf8');
    expect(content).to.include('<testsuites');
    expect(content).to.include('my-scope/button');
  });

  it('does not write a junit file when junit is not provided', async () => {
    const calls: string[] = [];
    await mkTester(calls).test(components, { env: 'my-org.my-scope/my-env' } as any);
    expect(await fs.readdir(tmpDir)).to.deep.equal([]);
  });
});
