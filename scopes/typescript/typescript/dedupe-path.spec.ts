import { expect } from 'chai';
import { dedupePaths } from './tsconfig-writer';

describe('dedupePath', () => {
  it('should return the root-dir if there is only one env involved', () => {
    const input = [{ ids: ['env1'], paths: ['p1/e1, p2'] }];
    const output = dedupePaths(input);
    expect(output).to.deep.equal([{ ids: ['env1'], paths: ['.'] }]);
  });
  it('should set the env with the most components', () => {
    const input = [
      { ids: ['env1'], paths: ['p1/e1', 'p1/e2'] },
      { ids: ['env2'], paths: ['p1/e3'] },
    ];
    const output = dedupePaths(input);
    // @ts-ignore
    expect(output).to.deep.equal([
      { ids: ['env2'], paths: ['p1/e3'] },
      { ids: ['env1'], paths: ['.'] },
    ]);
  });
  it('should not set any env to a shared dir if it no env has max components', () => {
    const input = [
      { ids: ['env1'], paths: ['p1/e1'] },
      { ids: ['env2'], paths: ['p1/e2'] },
    ];
    const output = dedupePaths(input);
    expect(output.length).to.equal(2);
    // @ts-ignore
    expect(output).to.deep.equal(input);
  });
});
