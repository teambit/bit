import { join, dirname, resolve } from 'path';
import { State, Console } from '@teambit/capsule';
import { tmpdir } from 'os';
import { mkdirp, writeFile } from 'fs-extra';
import { Component } from '../../component';
import { FsContainer, Capsule } from '../../isolator/capsule';

type CapsuleContent = { [k: string]: string };

export async function createFakeCapsule(fs: CapsuleContent, id: string) {
  const bitId = { toString: () => id };
  const location = getFakeCapsuleLocation(id);
  await createFS(location, fs);
  const container = new FsContainer(location);

  const capsule = new Capsule(
    container,
    container.fs,
    // eslint-disable-next-line no-undef
    new Console(),
    ({} as any) as State,
    {
      id: bitId
    } as Component
  );
  return capsule;
}

async function createFS(targetDir: string, content: CapsuleContent) {
  await mkdirp(targetDir);
  await Promise.all(
    Object.keys(content).map(async key => {
      const realPath = join(targetDir, key);
      const containingFolder = dirname(realPath);
      await mkdirp(containingFolder);
      const filePath = resolve(targetDir, key);
      await writeFile(filePath, content[key]);
    })
  );
}

export function getTestCase(name: string): CapsuleContent {
  const main = 'src/index.js';
  return {
    [main]: `console.log('hello-world)`,
    'package.json': JSON.stringify({ main, name }, null, 2)
  };
}

export function getFakeCapsuleLocation(id: string) {
  return join(tmpdir(), id);
}
