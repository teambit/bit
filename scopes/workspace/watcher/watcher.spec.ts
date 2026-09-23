import { expect } from 'chai';
import { watchIgnorePatterns } from './watcher';

describe('watchIgnorePatterns', () => {
  it('should ignore the files bit generates, which no component lists', () => {
    // otherwise every save of one is reported as a change to a component "configured to be ignored".
    // a workspace-root component owns the whole tree, so the ones at the workspace root are the case
    const patterns = watchIgnorePatterns('.bit');
    expect(patterns).to.include.members(['**/package.json', '**/yarn.lock', '**/package-lock.json']);
    expect(patterns).to.include('tsconfig.json');
  });
  it('should report them in a workspace that tracks every file, there they are component source', () => {
    const patterns = watchIgnorePatterns('.bit', true);
    expect(patterns).to.not.include('**/package.json');
    expect(patterns).to.not.include('tsconfig.json');
  });
  it('should always ignore node_modules and the local scope', () => {
    expect(watchIgnorePatterns('.bit', true)).to.include.members(['**/node_modules/**', '**/.bit/**']);
  });
});
