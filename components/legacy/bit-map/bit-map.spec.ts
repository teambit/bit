import { expect } from 'chai';
import fs from 'fs-extra';
import ignore from 'ignore';
import os from 'os';
import * as path from 'path';
import { ComponentID } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
import { logger } from '@teambit/legacy.logger';
import {
  BitMap,
  fileContentsForVersioning,
  normalizeBitmapContentForVersioning,
  readVersionedBitmapEntries,
} from './bit-map';
import { filterByIgnoreFiles, WORKSPACE_ROOT_DIR } from './component-map';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

const getBitmapInstance = async () => {
  return BitMap.load(__dirname, '');
};

const addComponentParamsFixture = {
  componentId: ComponentID.fromObject({ name: 'is-string' }, 'my-scope'),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  defaultScope: 'my-scope',
};

describe('BitMap', function () {
  // @ts-ignore
  logger.debug = () => {};
  // @ts-ignore
  logger.info = () => {};
  // @ts-ignore
  // this.timeout(0);
  describe('toObject', () => {
    let bitMap: BitMap;
    let componentMap;
    before(async () => {
      bitMap = await getBitmapInstance();
      bitMap.addComponent(addComponentParamsFixture);
      const allComponents = bitMap.toObjects();
      componentMap = allComponents['is-string'];
    });
    it('should remove the "id" property', () => {
      expect(componentMap).to.not.have.property('id');
    });
    it('should sort the components alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      exampleComponent.defaultScope = '';
      bitMap = await getBitmapInstance();
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string1', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string3', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string2', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const ids = Object.keys(allComponents);
      expect(ids[0]).to.equal('is-string1');
      expect(ids[1]).to.equal('is-string2');
      expect(ids[2]).to.equal('is-string3');
    });
  });
  describe('loadComponents', () => {
    let bitMap: BitMap;
    before(async () => {
      bitMap = await getBitmapInstance();
    });
    it('should throw DuplicateRootDir error when multiple ids have the same rootDir', () => {
      const invalidBitMap = {
        comp1: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
        comp2: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(DuplicateRootDir);
    });
    it('should throw when a component has scope but not version', () => {
      const invalidBitMap = {
        'scope/comp1': {
          mainFile: 'index.js',
          scope: 'scope',
          rootDir: 'comp1',
          exported: true,
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(
        '.bitmap entry of "scope/comp1" is invalid, it has a scope-name "scope", however, it does not have any version'
      );
    });
  });
  describe('workspace-root component', () => {
    const rootComponentParams = {
      componentId: ComponentID.fromObject({ name: 'ws-root' }, 'my-scope'),
      files: [{ name: 'README.md', relativePath: 'README.md', test: false }],
      mainFile: 'README.md',
      defaultScope: 'my-scope',
      rootDir: WORKSPACE_ROOT_DIR,
    };
    const nestedComponentParams = {
      componentId: ComponentID.fromObject({ name: 'comp1' }, 'my-scope'),
      files: [{ name: 'index.js', relativePath: 'index.js', test: false }],
      mainFile: 'index.js',
      defaultScope: 'my-scope',
      rootDir: 'packages/comp1',
    };
    it('should allow a rootDir of "." to contain other components, in both add orders', async () => {
      const rootFirst = await getBitmapInstance();
      rootFirst.addComponent(rootComponentParams);
      expect(() => rootFirst.addComponent(nestedComponentParams)).to.not.throw();

      const nestedFirst = await getBitmapInstance();
      nestedFirst.addComponent(nestedComponentParams);
      expect(() => nestedFirst.addComponent(rootComponentParams)).to.not.throw();
    });
    it('should keep rejecting nesting between two non-root components', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(nestedComponentParams);
      expect(() =>
        bitMap.addComponent({
          ...nestedComponentParams,
          componentId: ComponentID.fromObject({ name: 'comp2' }, 'my-scope'),
          rootDir: 'packages/comp1/nested',
        })
      ).to.throw();
    });
    it('getNestedRootDirs should return the nested components for the root, and nothing for a leaf', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(rootComponentParams);
      bitMap.addComponent(nestedComponentParams);
      expect(bitMap.getNestedRootDirs(WORKSPACE_ROOT_DIR)).to.deep.equal(['packages/comp1']);
      expect(bitMap.getNestedRootDirs('packages/comp1')).to.deep.equal([]);
    });
  });
  describe('normalizeBitmapContentForVersioning', () => {
    const rawBitmap = JSON.stringify(
      {
        _bit_lane: { id: { name: 'dev', scope: 'my-scope' }, exported: false },
        comp1: {
          name: 'comp1',
          scope: 'my-scope',
          version: '0a14284ddaadde623d5c11f5511594485a14b3c8',
          defaultScope: 'my-org.demo',
          mainFile: 'index.ts',
          rootDir: 'comp1',
          config: { 'teambit.envs/envs': { env: 'teambit.harmony/node' } },
          nextVersion: { version: 'patch', message: 'soft-tagged' },
        },
        '$schema-version': '17.0.0',
      },
      null,
      4
    );
    let normalized: string;
    let parsed: Record<string, any>;
    before(() => {
      normalized = normalizeBitmapContentForVersioning(rawBitmap);
      parsed = JSON.parse(normalized.slice(normalized.indexOf('{')));
    });
    it('should empty the version, which changes on every snap', () => {
      expect(parsed.comp1.version).to.equal('');
    });
    it('should drop the config, which a snap moves into the version and removes from the map', () => {
      expect(parsed.comp1).to.not.have.property('config');
    });
    it('should drop the pending soft-tag, which persisting it clears from the map', () => {
      // otherwise the root would capture it when tagged along and never converge after --persist
      expect(parsed.comp1).to.not.have.property('nextVersion');
    });
    it('should drop the lane, workspace state that export and lane switch change', () => {
      expect(normalized).to.not.have.string('_bit_lane');
    });
    it('should keep the scope, so cross-scope components survive a restore', () => {
      expect(parsed.comp1.scope).to.equal('my-scope');
    });
    it('should resolve the scope into one field, the export moves it from defaultScope to scope', () => {
      // otherwise the first export modifies the root, and a clone of it is born modified
      expect(parsed.comp1).to.not.have.property('defaultScope');
    });
    it('should read the scope of a component not exported yet from its defaultScope', () => {
      const notExported = JSON.stringify({ comp2: { name: 'comp2', scope: '', defaultScope: 'my-org.demo' } });
      const normalizedNotExported = normalizeBitmapContentForVersioning(notExported);
      expect(JSON.parse(normalizedNotExported.slice(normalizedNotExported.indexOf('{'))).comp2.scope).to.equal(
        'my-org.demo'
      );
    });
    it('should drop the schema of the file, which a bit upgrade rewrites', () => {
      expect(parsed).to.not.have.property('$schema-version');
    });
    it('should keep the durable map intact', () => {
      expect(parsed.comp1.rootDir).to.equal('comp1');
      expect(parsed.comp1.mainFile).to.equal('index.ts');
    });
    it('should be idempotent, otherwise the root component would never converge', () => {
      expect(normalizeBitmapContentForVersioning(normalized)).to.equal(normalized);
    });
  });
  describe('readVersionedBitmapEntries', () => {
    const versionedBitmap = `/* THIS IS A BIT-AUTO-GENERATED FILE */
${JSON.stringify(
  {
    'my-scope/comp1': { name: 'comp1', scope: 'my-scope', version: '', mainFile: 'index.ts', rootDir: 'comp1' },
    comp2: {
      name: 'comp2',
      scope: '',
      version: '',
      defaultScope: 'my-org.demo',
      mainFile: 'index.ts',
      rootDir: 'comp2',
    },
    'ws-root': { name: 'ws-root', scope: 'my-scope', version: '', mainFile: 'workspace.jsonc', rootDir: '.' },
    '$schema-version': '17.0.0',
  },
  null,
  4
)}`;
    let entries: ReturnType<typeof readVersionedBitmapEntries>;
    before(() => {
      entries = readVersionedBitmapEntries(versionedBitmap);
    });
    it('should list every component with its root-dir, the root component included', () => {
      expect(entries.map((entry) => entry.rootDir)).to.have.members(['comp1', 'comp2', WORKSPACE_ROOT_DIR]);
    });
    it('should give an exported component its full id, which is what its remote knows it by', () => {
      const comp1 = entries.find((entry) => entry.rootDir === 'comp1');
      expect(comp1).to.deep.equal({ id: 'my-scope/comp1', rootDir: 'comp1' });
    });
    it('should give a component not exported yet the scope it is exported to', () => {
      // a root versioned before the first export lists its members this way, and that export carries them all
      const comp2 = entries.find((entry) => entry.rootDir === 'comp2');
      expect(comp2).to.deep.equal({ id: 'my-org.demo/comp2', rootDir: 'comp2' });
    });
    it('should return nothing for an empty map', () => {
      expect(readVersionedBitmapEntries(JSON.stringify({ '$schema-version': '17.0.0' }))).to.deep.equal([]);
    });
  });
  describe('a rootDir with one owner', () => {
    const componentParams = {
      componentId: ComponentID.fromObject({ name: 'comp1' }, 'my-scope'),
      files: [{ name: 'index.ts', relativePath: 'index.ts', test: false }],
      mainFile: 'index.ts',
      defaultScope: 'my-scope',
      rootDir: 'packages/comp1',
    };
    it('should reject a second component with the same rootDir, rather than leave it for the next load', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(componentParams);
      const addAnother = () =>
        bitMap.addComponent({
          ...componentParams,
          componentId: ComponentID.fromObject({ name: 'comp2' }, 'my-scope'),
        });
      expect(addAnother).to.throw('already used by another component');
      // and the rejected entry is not left behind in the map
      expect(bitMap.components).to.have.lengthOf(1);
      expect(bitMap.components[0].rootDir).to.equal('packages/comp1');
    });
    it('should let the same component be added again', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(componentParams);
      expect(() => bitMap.addComponent(componentParams)).to.not.throw();
    });
  });
  describe('fileContentsForVersioning', () => {
    const rawBitmap = Buffer.from(
      JSON.stringify({
        comp1: { name: 'comp1', scope: 'my-scope', version: 'abc', mainFile: 'index.ts', rootDir: 'comp1' },
      })
    );
    const params = (name: string, rootDir: string) => ({
      componentId: ComponentID.fromObject({ name }, 'my-scope'),
      files: [{ name: 'README.md', relativePath: 'README.md', test: false }],
      mainFile: 'README.md',
      defaultScope: 'my-scope',
      rootDir,
    });
    it('should normalize only the .bitmap of the workspace-root component', async () => {
      const bitMap = await getBitmapInstance();
      const rootMap = bitMap.addComponent(params('ws-root', WORKSPACE_ROOT_DIR));
      const nestedMap = bitMap.addComponent(params('comp1', 'packages/comp1'));
      expect(fileContentsForVersioning(rootMap, '.bitmap', rawBitmap).toString()).to.have.string('"version": ""');
      expect(fileContentsForVersioning(rootMap, 'README.md', rawBitmap)).to.equal(rawBitmap);
      expect(fileContentsForVersioning(nestedMap, '.bitmap', rawBitmap)).to.equal(rawBitmap);
    });
  });
  describe('loading a workspace that has no .bitmap yet', () => {
    it('should keep the ignore options, they apply to the scans of the components added next', async () => {
      const bitMap = await BitMap.load(__dirname, '', ['*.bak'], true);
      expect(bitMap.components).to.have.lengthOf(0);
      expect(bitMap.ignoredFiles).to.deep.equal(['*.bak']);
      expect(bitMap.trackAllFiles).to.be.true;
    });
  });
  describe('trackDirectoryChanges', () => {
    const compId = ComponentID.fromObject({ name: 'comp1' }, 'my-scope');
    let workspaceDir: string;
    let bitMap: BitMap;
    const resolve = (filePath: string) => bitMap.getComponentIdByPath(filePath)?.toString();
    beforeEach(async () => {
      workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-map-spec-'));
      await fs.outputFile(path.join(workspaceDir, 'comp1/index.js'), '');
      bitMap = await BitMap.load(workspaceDir, 'my-scope');
      bitMap.loadComponents({ comp1: { scope: '', mainFile: 'index.js', rootDir: 'comp1' } }, 'my-scope');
      await bitMap.loadFiles();
    });
    afterEach(async () => {
      await fs.remove(workspaceDir);
    });
    it('should resolve a file added to the rootDir when the paths index was already built', async () => {
      expect(resolve('comp1/index.js')).to.equal(compId.toString());
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
    });
    it('should stop resolving a file removed from the rootDir', async () => {
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
      await fs.remove(path.join(workspaceDir, 'comp1/new-file.js'));
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.be.undefined;
    });
    it('should keep the existing files resolvable when the paths index was not built yet', async () => {
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/index.js')).to.equal(compId.toString());
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
    });
  });

  describe('filterByIgnoreFiles with ignore files below the workspace root', () => {
    let tmpDir: string;
    const paths = ['docs/sub/.gitignore', 'docs/.gitignore', 'docs/a.log', 'docs/sub/keep.log'];
    before(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-ignore-'));
      await fs.outputFile(path.join(tmpDir, 'docs/.gitignore'), '*.log\n');
      await fs.outputFile(path.join(tmpDir, 'docs/sub/.gitignore'), '!keep.log\n');
    });
    after(async () => {
      await fs.remove(tmpDir);
    });
    it('should let a deeper rule decide, whatever order the scan walked them in', async () => {
      // the paths list the deeper ignore file first, which is what the scan may hand over. read in
      // that order, the rule above would win and take the file the one below re-included
      const filtered = await filterByIgnoreFiles(WORKSPACE_ROOT_DIR, tmpDir, ignore(), paths);
      expect(filtered).to.include('docs/sub/keep.log');
      expect(filtered).to.not.include('docs/a.log');
    });
  });
});
