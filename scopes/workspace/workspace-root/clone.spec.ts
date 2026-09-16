import { expect } from 'chai';
import os from 'os';
import path from 'path';
import { resolveComponentDir } from './clone';

describe('resolveComponentDir', () => {
  const workspacePath = path.resolve(os.tmpdir(), 'ws');
  it('should resolve a root-dir inside the workspace', () => {
    expect(resolveComponentDir(workspacePath, { id: 'a', rootDir: 'comps/a' })).to.equal(
      path.join(workspacePath, 'comps', 'a')
    );
  });
  it('should refuse a root-dir that climbs out of the workspace, the list comes from a remote', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: '../a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an absolute root-dir', () => {
    const resolve = () =>
      resolveComponentDir(workspacePath, { id: 'a', rootDir: path.resolve(os.tmpdir(), 'elsewhere') });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse the workspace root itself, only the root component owns it', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: '.' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an entry without a root-dir rather than fail on it later', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
});
