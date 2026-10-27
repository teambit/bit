import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Scope, ComponentNotFound } from '@teambit/legacy.scope';
import { ModelComponent, Version, BitObjectList, Ref } from '@teambit/objects';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { mergeObjects } from './export-scope-components';

const SCOPE_NAME = 'export-spec';
const hash = (name: string) => Buffer.from(name.padEnd(20, '-')).toString('hex');
/** a component with one version, its head, that depends on the given versions of other components of the scope */
const objectsOf = (name: string, deps: Array<{ name: string; version: string }>) => {
  const component = ModelComponent.from({ name, scope: SCOPE_NAME } as any);
  component.setHead(Ref.from(hash(name)));
  const version = new Version({
    mainFile: 'index.ts',
    files: [],
    log: { message: '', date: '0', username: 'u', email: 'e' },
    hash: hash(name),
    parents: [],
  } as any);
  version.flattenedDependencies = ComponentIdList.fromArray(
    deps.map((dep) => ComponentID.fromObject({ scope: SCOPE_NAME, name: dep.name, version: dep.version }))
  );
  return [component, version];
};
const rejectionOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err) => err
  );

describe('mergeObjects', () => {
  describe('the dependency check of the export', () => {
    let scope: Scope;
    let scopePath: string;
    before(async () => {
      scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-export-spec-'));
      scope = await Scope.ensure(scopePath, SCOPE_NAME);
    });
    after(async () => {
      await fs.remove(scopePath);
    });
    it('should accept an export whose dependencies are among the exported versions', async () => {
      const objects = [...objectsOf('button', [{ name: 'icon', version: hash('icon') }]), ...objectsOf('icon', [])];
      const { mergedIds } = await mergeObjects(scope, new BitObjectList(objects), true);
      expect(mergedIds.map((id) => id.toString()).sort()).to.deep.equal([
        `${SCOPE_NAME}/button@${hash('button')}`,
        `${SCOPE_NAME}/icon@${hash('icon')}`,
      ]);
    });
    it('should reject an export whose dependency version is not exported and not in the scope', async () => {
      const objects = [...objectsOf('button', [{ name: 'icon', version: hash('icon-old') }]), ...objectsOf('icon', [])];
      const err = await rejectionOf(mergeObjects(scope, new BitObjectList(objects), true));
      expect(err).to.be.instanceOf(ComponentNotFound);
      expect(err.message).to.include(`icon@${hash('icon-old')}`);
    });
    it('should reject an export whose dependency component is not exported and not in the scope', async () => {
      const objects = objectsOf('button', [{ name: 'icon', version: hash('icon') }]);
      const err = await rejectionOf(mergeObjects(scope, new BitObjectList(objects), true));
      expect(err).to.be.instanceOf(ComponentNotFound);
    });
  });
});
