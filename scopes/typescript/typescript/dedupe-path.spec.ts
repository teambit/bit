import { dedupePaths } from './tsconfig-writer';

describe('dedupePath', () => {
  it('should return the root-dir if there is only one env involved', () => {
    const input = [{ id: 'env1', paths: ['p1/e1, p2'] }];
    const output = dedupePaths(input);
    expect(output).toEqual([{ id: 'env1', paths: ['.'] }]);
  });
  it('should set the env with the most components', () => {
    const input = [
      { id: 'env1', paths: ['p1/e1', 'p1/e2'] },
      { id: 'env2', paths: ['p1/e3'] },
    ];
    const output = dedupePaths(input);
    // @ts-ignore
    expect(output).toEqual(
      expect.arrayContaining([
        { id: 'env1', paths: ['.'] },
        { id: 'env2', paths: ['p1/e3'] },
      ])
    );
  });
  it('should not set any env to a shared dir if it no env has max components', () => {
    const input = [
      { id: 'env1', paths: ['p1/e1'] },
      { id: 'env2', paths: ['p1/e2'] },
    ];
    const output = dedupePaths(input);
    // @ts-ignore
    expect(output).toEqual(expect.arrayContaining(input));
  });
});
