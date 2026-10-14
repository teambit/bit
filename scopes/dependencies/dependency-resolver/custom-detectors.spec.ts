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
    expect(await detectWithCustomDetectors(null, [file('index.ts', "import 'a';")], dir)).to.eq(null);
  });
  it('should leave the registered env.jsonc and MDX detectors to the native scanner', async () => {
    class EnvJsoncDetector implements DependencyDetector {
      isSupported({ filename }) {
        return filename.endsWith('env.jsonc');
      }
      detect() {
        return [];
      }
    }
    class MDXDependencyDetector implements DependencyDetector {
      isSupported({ ext }) {
        return ext === '.mdx';
      }
      detect() {
        return ['react'];
      }
    }
    DetectorHook.hooks = [new EnvJsoncDetector(), new MDXDependencyDetector()];
    expect(await detectWithCustomDetectors(null, [file('docs.mdx', '# hi')], dir)).to.eq(null);
    class Patched extends MDXDependencyDetector {}
    DetectorHook.hooks = [new Patched()];
    expect(await detectWithCustomDetectors(null, [file('docs.mdx', '# hi')], dir)).to.not.eq(null);
    const overridden = new MDXDependencyDetector();
    overridden.isSupported = () => true;
    DetectorHook.hooks = [overridden];
    expect(await detectWithCustomDetectors(null, [file('docs.mdx', '# hi')], dir)).to.not.eq(null);
  });
  it('should detect only the files an env detector supports', async () => {
    const vue = file('button.vue', "import x from 'vue';\nimport y from './y';");
    const ts = file('index.ts', "import 'a';");
    expect(await detectWithCustomDetectors([vueDetector], [vue, ts], dir)).to.deep.equal({
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
    expect(await detectWithCustomDetectors([throwing, vueDetector], [skipped, broken], dir)).to.deep.equal({
      [skipped]: { dependencies: [], typescript: false },
      [broken]: { dependencies: [], typescript: false },
    });
  });
  it('should fall back to a registered detector, resolved through TypeScript, except for env.jsonc', async () => {
    DetectorHook.hooks = [{ isSupported: () => true, detect: () => ['svelte'] }];
    const svelte = file('a.svelte', '');
    const config = file('env.jsonc', '{}');
    expect(await detectWithCustomDetectors([], [svelte, config], dir)).to.deep.equal({
      [svelte]: { dependencies: ['svelte'], typescript: true },
    });
  });
  it("should return what a detector's dependencyLookup resolves, as filing-cabinet calls it", async () => {
    const calls: Array<Record<string, any>> = [];
    const withLookup: DependencyDetector = {
      ...vueDetector,
      dependencyLookup: (context) => {
        calls.push(context);
        if (context.dependency === './missing') return '';
        return context.dependency === 'vue' ? 'node_modules/vue/index.js' : '/abs/y.vue';
      },
    };
    const vue = file(
      'button.vue',
      "import x from 'vue';\nimport y from './y';\nimport z from './missing';\nimport f from 'fs';"
    );
    const found = await detectWithCustomDetectors([withLookup], [vue], dir);
    expect(found).to.deep.equal({
      [vue]: {
        dependencies: ['vue', './y', './missing', 'fs'],
        typescript: false,
        lookups: {
          vue: path.resolve('node_modules/vue/index.js'),
          './y': path.resolve('/abs/y.vue'),
          './missing': null,
        },
      },
    });
    expect(calls[0]).to.include({ dependency: 'vue', filename: vue, directory: dir });
    expect(calls).to.have.lengthOf(3, 'built-ins are not looked up');
  });
  it("should prefer an env detector's lookup over a registered one's, and resolve through TypeScript", async () => {
    DetectorHook.hooks = [{ isSupported: () => true, detect: () => ['hook'], dependencyLookup: () => '/hook.js' }];
    const fromEnv: DependencyDetector = { ...vueDetector, dependencyLookup: () => '/env.js' };
    const vue = file('a.vue', "import x from 'x';");
    const svelte = file('b.svelte', '');
    expect(await detectWithCustomDetectors([fromEnv], [vue, svelte], dir)).to.deep.equal({
      [vue]: { dependencies: ['x'], typescript: true, lookups: { x: path.resolve('/env.js') } },
      [svelte]: { dependencies: ['hook'], typescript: true, lookups: { hook: path.resolve('/hook.js') } },
    });
  });
  it('should yield nothing for a file whose lookup throws', async () => {
    const throwing: DependencyDetector = {
      ...vueDetector,
      dependencyLookup: () => {
        throw new Error('resolve');
      },
    };
    const vue = file('a.vue', "import x from 'vue';");
    expect(await detectWithCustomDetectors([throwing], [vue], dir)).to.deep.equal({
      [vue]: { dependencies: [], typescript: false },
    });
  });
});
