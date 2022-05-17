import { expect } from 'chai';
import { splitPatterns, matchPatterns } from './match-patterns';

describe('Match patterns', () => {
  const patterns = ['**/*.ts', '**/*.js', '!**/*.md', '!**/*.json'];
  it('it should split patterns between include & exclude', async () => {
    const { includePatterns, excludePatterns } = splitPatterns(patterns);
    expect(includePatterns).to.include.members(['**/*.ts', '**/*.js']);
    expect(excludePatterns).to.include.members(['!**/*.md', '!**/*.json']);
  });

  it('it should match file patterns', async () => {
    const { includePatterns, excludePatterns } = splitPatterns(patterns);
    expect(matchPatterns('some/path/file.ts', includePatterns, excludePatterns)).to.be.true;
    expect(matchPatterns('some/path/file.js', includePatterns, excludePatterns)).to.be.true;
    expect(matchPatterns('some/path/file.md', includePatterns, excludePatterns)).to.be.false;
    expect(matchPatterns('some/path/file.json', includePatterns, excludePatterns)).to.be.false;
    expect(matchPatterns('some/path/file.doc', includePatterns, excludePatterns)).to.be.false;
  });

  it('it should match compositions', async () => {
    const compositionFilePattern = ['**/*.composition?(s).*'];
    const { includePatterns, excludePatterns } = splitPatterns(compositionFilePattern);
    expect(matchPatterns('some/path/file.ts', includePatterns, excludePatterns)).to.be.false;
    expect(matchPatterns('some/path/file.composition.ts', includePatterns, excludePatterns)).to.be.true;
  });
});
