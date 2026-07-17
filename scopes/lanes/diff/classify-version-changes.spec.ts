import { expect } from 'chai';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { classifyVersionChanges } from './classify-version-changes';
import type { VersionChangeSide } from './classify-version-changes';

/** minimal Version-like side; unspecified fields default to empty so each test isolates one axis. */
function side(obj: Record<string, any> = {}, extensionDependencies: unknown = []): VersionChangeSide {
  return { obj, extensionDependencies };
}

describe('classifyVersionChanges', () => {
  it('should report NONE when nothing changed', () => {
    const same = () => side({ files: [{ name: 'a', hash: 'h1' }], dependencies: [{ id: 'x@1.0.0' }] });
    expect(classifyVersionChanges(same(), same())).to.deep.equal([ChangeType.NONE]);
  });

  it('should report SOURCE_CODE when a file hash changed', () => {
    const base = side({ files: [{ name: 'a', hash: 'h1' }] });
    const compare = side({ files: [{ name: 'a', hash: 'h2' }] });
    expect(classifyVersionChanges(base, compare)).to.deep.equal([ChangeType.SOURCE_CODE]);
  });

  it('should report a dependency-only change as DEPENDENCY and NOT ASPECTS', () => {
    // the core regression: a dep-only change previously also emitted ASPECTS, dragging dep-only
    // components into the Config view with an empty config panel.
    const base = side({ dependencies: [{ id: 'x@1.0.0' }] });
    const compare = side({ dependencies: [{ id: 'x@2.0.0' }] });
    const result = classifyVersionChanges(base, compare);
    expect(result).to.include(ChangeType.DEPENDENCY);
    expect(result).to.not.include(ChangeType.ASPECTS);
    expect(result).to.deep.equal([ChangeType.DEPENDENCY]);
  });

  it('should treat a package-dependency-only change as DEPENDENCY, not ASPECTS', () => {
    const base = side({ packageDependencies: { lodash: '^4.0.0' } });
    const compare = side({ packageDependencies: { lodash: '^4.17.0' } });
    const result = classifyVersionChanges(base, compare);
    expect(result).to.deep.equal([ChangeType.DEPENDENCY]);
  });

  it('should treat an extensionDependencies-only change as DEPENDENCY, not ASPECTS', () => {
    const base = side({}, ['env@1.0.0']);
    const compare = side({}, ['env@2.0.0']);
    const result = classifyVersionChanges(base, compare);
    expect(result).to.deep.equal([ChangeType.DEPENDENCY]);
  });

  it('should report ASPECTS when the extensions (config) changed', () => {
    const base = side({ extensions: [{ name: 'teambit.react/react', config: { foo: 1 } }] });
    const compare = side({ extensions: [{ name: 'teambit.react/react', config: { foo: 2 } }] });
    expect(classifyVersionChanges(base, compare)).to.deep.equal([ChangeType.ASPECTS]);
  });

  it('should report ASPECTS when overrides changed', () => {
    const base = side({ overrides: { dependencies: { x: '-' } } });
    const compare = side({ overrides: {} });
    expect(classifyVersionChanges(base, compare)).to.deep.equal([ChangeType.ASPECTS]);
  });

  it('should report both DEPENDENCY and ASPECTS when deps AND config both changed', () => {
    const base = side({ dependencies: [{ id: 'x@1.0.0' }], extensions: [{ name: 'e', config: { a: 1 } }] });
    const compare = side({ dependencies: [{ id: 'x@2.0.0' }], extensions: [{ name: 'e', config: { a: 2 } }] });
    const result = classifyVersionChanges(base, compare);
    expect(result).to.include(ChangeType.DEPENDENCY);
    expect(result).to.include(ChangeType.ASPECTS);
  });

  it('should ignore a pure reorder of unordered collections', () => {
    // deps/files aren't sorted at snap time — a reorder of the same set must not read as a change.
    const base = side({
      files: [
        { name: 'a', hash: 'h1' },
        { name: 'b', hash: 'h2' },
      ],
      dependencies: [{ id: 'x@1.0.0' }, { id: 'y@1.0.0' }],
    });
    const compare = side({
      files: [
        { name: 'b', hash: 'h2' },
        { name: 'a', hash: 'h1' },
      ],
      dependencies: [{ id: 'y@1.0.0' }, { id: 'x@1.0.0' }],
    });
    expect(classifyVersionChanges(base, compare)).to.deep.equal([ChangeType.NONE]);
  });

  it('should order multiple change types as SOURCE_CODE, ASPECTS, DEPENDENCY', () => {
    const base = side({
      files: [{ name: 'a', hash: 'h1' }],
      extensions: [{ name: 'e', config: { a: 1 } }],
      dependencies: [{ id: 'x@1.0.0' }],
    });
    const compare = side({
      files: [{ name: 'a', hash: 'h2' }],
      extensions: [{ name: 'e', config: { a: 2 } }],
      dependencies: [{ id: 'x@2.0.0' }],
    });
    expect(classifyVersionChanges(base, compare)).to.deep.equal([
      ChangeType.SOURCE_CODE,
      ChangeType.ASPECTS,
      ChangeType.DEPENDENCY,
    ]);
  });
});
