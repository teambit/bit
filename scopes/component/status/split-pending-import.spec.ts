import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ComponentsPendingImport } from '@teambit/legacy.consumer';
import { splitPendingImport } from './split-pending-import';

describe('splitPendingImport', () => {
  it('should list a component pending import only as pending-import, not as invalid', () => {
    const pendingImportId = ComponentID.fromString('my-org.my-scope/pending@0.0.1');
    const invalidId = ComponentID.fromString('my-org.my-scope/invalid@0.0.1');
    const { importPendingComponents, invalidComponents } = splitPendingImport([
      { id: pendingImportId, err: new ComponentsPendingImport([pendingImportId.toString()]) },
      { id: invalidId, err: new Error('main file was removed') },
    ]);
    expect(importPendingComponents.map((c) => c.id.toString())).to.deep.equal([pendingImportId.toString()]);
    expect(invalidComponents.map((c) => c.id.toString())).to.deep.equal([invalidId.toString()]);
  });
});
