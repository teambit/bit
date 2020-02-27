import { join, dirname, resolve } from 'path';
import { State, Console } from '@teambit/capsule';
import { tmpdir } from 'os';
import { mkdirp, writeFile } from 'fs-extra';
import { FsContainer, ComponentCapsule } from '../../capsule-ext';

type CapsuleContent = { [k: string]: string };

export async function createFakeCapsule(fs: CapsuleContent, id: string) {
  const bitId = { toString: () => id };
  const location = join(tmpdir(), id);
  await createFS(location, fs);

  const container = new FsContainer({
    wrkDir: location,
    bitId
  });

  const capsule = new ComponentCapsule(
    container,
    container.fs,
    // eslint-disable-next-line no-undef
    new Console(),
    ({} as any) as State,
    {
      wrkDir: location,
      bitId
    }
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
