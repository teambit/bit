import 'reflect-metadata';
import { expect } from 'chai';
import type { ExtensionManifest } from '@teambit/harmony';
import { Aspect, Harmony } from '@teambit/harmony';
import { MainRuntime } from '@teambit/harmony.modules.runtimes';
import { replaceNeverLoadedAspects } from './replace-never-loaded-aspects';

const ENV_ID = 'test/env';

function createEnvAspect(name: string, shouldFail = false): Aspect {
  const aspect = Aspect.create({ id: ENV_ID });
  aspect.addRuntime({
    runtime: MainRuntime,
    dependencies: [],
    provider: async () => {
      if (shouldFail) throw new Error(`failed loading ${name}`);
      return { name };
    },
  });
  return aspect;
}

// aspect-loader passes aspects to harmony.load the same way
function loadAspects(harmony: Harmony, aspects: Aspect[]) {
  return harmony.load(aspects as unknown as ExtensionManifest[]);
}

async function loadHarmonyWithFailedAspect(): Promise<Harmony> {
  const runtimeAspect = Aspect.create({ id: 'test/runtime', declareRuntime: MainRuntime });
  const harmony = await Harmony.load([runtimeAspect], MainRuntime.name, {});
  await harmony.run();
  await loadAspects(harmony, [createEnvAspect('stale', true)]).catch(() => {});
  return harmony;
}

describe('replaceNeverLoadedAspects()', () => {
  it('without it, harmony runs the first manifest of an aspect that never loaded', async () => {
    const harmony = await loadHarmonyWithFailedAspect();
    let error: Error | undefined;
    await loadAspects(harmony, [createEnvAspect('fresh')]).catch((err) => {
      error = err;
    });
    expect(error?.message).to.include('failed loading stale');
  });
  it('makes harmony run the new manifest of an aspect that never loaded', async () => {
    const harmony = await loadHarmonyWithFailedAspect();
    const freshAspect = createEnvAspect('fresh');
    expect(replaceNeverLoadedAspects(harmony, [freshAspect])).to.deep.equal([ENV_ID]);
    await loadAspects(harmony, [freshAspect]);
    expect(harmony.get<{ name: string }>(ENV_ID).name).to.equal('fresh');
  });
  it('does not replace an aspect that loaded already', async () => {
    const harmony = await loadHarmonyWithFailedAspect();
    const freshAspect = createEnvAspect('fresh');
    replaceNeverLoadedAspects(harmony, [freshAspect]);
    await loadAspects(harmony, [freshAspect]);
    expect(replaceNeverLoadedAspects(harmony, [createEnvAspect('another')])).to.deep.equal([]);
    expect(harmony.get<{ name: string }>(ENV_ID).name).to.equal('fresh');
  });
});
