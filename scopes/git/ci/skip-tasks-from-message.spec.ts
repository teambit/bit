import { expect } from 'chai';
import { extractSkipTasksFromMessage } from './skip-tasks-from-message';

describe('extractSkipTasksFromMessage', () => {
  it('returns no tasks and the original message when there is no token', () => {
    const res = extractSkipTasksFromMessage('feat: regular commit');
    expect(res.skipTasks).to.deep.equal([]);
    expect(res.message).to.equal('feat: regular commit');
  });

  it('parses a comma-separated list and strips the token from the message', () => {
    const res = extractSkipTasksFromMessage('feat: ui change [skip-tasks: GeneratePreview, ExtractSchema]');
    expect(res.skipTasks).to.deep.equal(['GeneratePreview', 'ExtractSchema']);
    expect(res.message).to.equal('feat: ui change');
  });

  it('is case-insensitive on the keyword and trims surrounding whitespace', () => {
    const res = extractSkipTasksFromMessage('[Skip-Tasks:  PublishComponents ]');
    expect(res.skipTasks).to.deep.equal(['PublishComponents']);
    expect(res.message).to.equal('');
  });

  it('ignores empty entries from stray commas', () => {
    const res = extractSkipTasksFromMessage('msg [skip-tasks: A,,B,]');
    expect(res.skipTasks).to.deep.equal(['A', 'B']);
  });

  it('collapses the gap left by a mid-message token', () => {
    const res = extractSkipTasksFromMessage('before [skip-tasks: A] after');
    expect(res.message).to.equal('before after');
  });
});
