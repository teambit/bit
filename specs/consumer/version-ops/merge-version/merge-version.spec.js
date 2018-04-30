import { expect } from 'chai';
import sinon from 'sinon';
import { filesStatusWithoutSharedDir } from '../../../../src/consumer/versions-ops/merge-version';
import ConsumerComponent from '../../../../src/consumer/component/consumer-component';

describe('filesStatusWithoutSharedDir', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
  });
  const originalFilesStatus = { 'bar/foo.js': 'updated' };
  const component = new ConsumerComponent({
    name: 'foo',
    box: 'bar',
    version: '0.0.1',
    mainFile: 'bar/foo.js',
    scope: 'myScope'
  });
  const componentMap = {
    origin: 'IMPORTED'
  };
  it('should return the same filesStatus when there is no originallySharedDir', () => {
    sandbox.stub(component, 'setOriginallySharedDir').returns();
    const filesStatusResult = filesStatusWithoutSharedDir(originalFilesStatus, component, componentMap);
    expect(filesStatusResult).to.deep.equal(originalFilesStatus);
  });
  it('should return the filesStatus without the sharedDir when there the originallySharedDir is set and is IMPORTED', () => {
    sandbox.stub(component, 'setOriginallySharedDir').returns();
    component.originallySharedDir = 'bar';
    const filesStatusResult = filesStatusWithoutSharedDir(originalFilesStatus, component, componentMap);
    expect(filesStatusResult).to.deep.equal({ 'foo.js': 'updated' });
  });
  it('should return the same filesStatus when there the originallySharedDir is set and is AUTHORED', () => {
    sandbox.stub(component, 'setOriginallySharedDir').returns();
    component.originallySharedDir = 'bar';
    componentMap.origin = 'AUTHORED';
    const filesStatusResult = filesStatusWithoutSharedDir(originalFilesStatus, component, componentMap);
    expect(filesStatusResult).to.deep.equal(originalFilesStatus);
  });
});
