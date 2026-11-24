import { unchangedContext } from './config-editor';

// Tests the decision only, without rendering: rendering needs `react-dom`, and this component's env can
// resolve a `react-dom` that does not match its `react`, which fails the suite before it runs.
jest.mock('@teambit/code.ui.diff-viewer', () => ({ DiffViewer: () => null }));

describe('unchangedContext', () => {
  it('gives unlimited context when both sides are the same, so the diff is shown in full', () => {
    const same = JSON.stringify({ policy: {} }, null, 2);
    expect(unchangedContext(same, same)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('keeps the default context when the sides differ', () => {
    expect(unchangedContext('{}', '{ "policy": {} }')).toBeUndefined();
  });
});
