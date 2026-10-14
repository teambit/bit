import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { detectWithCustomDetectors } from './custom-detectors';
import { DetectorHook, type DependencyDetector } from './detector-hook';

const vueDetector: DependencyDetector = {
  isSupported: ({ ext }) => ext === '.vue',
  detect: (content) => [...content.matchAll(/from '([^']+)'/g)].map((match) => match[1]),
};

describe('detectWithCustomDetectors()', () => {
  let dir: string;
  let hooks: DependencyDetector[];
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-detectors-'));
    hooks = DetectorHook.hooks;
    DetectorHook.hooks = [];
  });
  afterEach(() => {
    DetectorHook.hooks = hooks;
    fs.removeSync(dir);
  });
  const file = (name: string, content: string) => {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  it('should return null without any custom detector', async () => {
    expect(await detectWithCustomDetectors(null, [file('index.ts', "import 'a';")])).to.eq(null);
  });
  it('should detect only the files an env detector supports', async () => {
    const vue = file('button.vue', "import x from 'vue';\nimport y from './y';");
    const ts = file('index.ts', "import 'a';");
    expect(await detectWithCustomDetectors([vueDetector], [vue, ts])).to.deep.equal({
      [vue]: { dependencies: ['vue', './y'], typescript: false },
    });
  });
  it('should skip @bit-no-check files and swallow detector errors', async () => {
    const skipped = file('a.vue', "// @bit-no-check\nimport x from 'vue';");
    const broken = file('b.vue', '');
    const throwing: DependencyDetector = {
      isSupported: ({ filename }) => filename === broken,
      detect: () => {
        throw new Error('parse');
      },
    };
    expect(await detectWithCustomDetectors([throwing, vueDetector], [skipped, broken])).to.deep.equal({
      [skipped]: { dependencies: [], typescript: false },
      [broken]: { dependencies: [], typescript: false },
    });
  });
  it('should fall back to a registered detector, resolved through TypeScript, except for env.jsonc', async () => {
    DetectorHook.hooks = [{ isSupported: () => true, detect: () => ['svelte'] }];
    const svelte = file('a.svelte', '');
    const config = file('env.jsonc', '{}');
    expect(await detectWithCustomDetectors([], [svelte, config])).to.deep.equal({
      [svelte]: { dependencies: ['svelte'], typescript: true },
    });
  });
});
