import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ListerAspect } from '@teambit/lister';
import type { ListerMain } from '@teambit/lister';

type SearchResults = Awaited<ReturnType<ListerMain['search']>>;

/**
 * the "bit search" command, with --local-only so no remote is involved. it lives here rather than in the lister
 * aspect, since tracking the components needs the tracker, and lister and tracker are in the same dependency cycle.
 */
describe('bit search command', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let search: (queries: string[], flags?: Record<string, any>) => Promise<SearchResults>;
  let searchReport: (queries: string[], flags?: Record<string, any>) => Promise<string>;

  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    fs.outputFileSync(path.join(workspacePath, 'bar/foo/index.js'), 'module.exports = () => "foo";');
    fs.outputFileSync(path.join(workspacePath, 'utils/is-type/index.js'), 'module.exports = () => "is-type";');
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect, ListerAspect], workspacePath);
    const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
    await tracker.track({ rootDir: 'bar/foo', componentName: 'bar/foo' });
    await tracker.track({ rootDir: 'utils/is-type', componentName: 'utils/is-type' });

    const searchCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('search');
    if (!searchCmd?.report || !searchCmd.json) throw new Error('the "search" command is not registered');
    search = async (queries, flags = {}) =>
      (await searchCmd.json!([queries] as any, { localOnly: true, ...flags })) as SearchResults;
    searchReport = async (queries, flags = {}) =>
      stripAnsi((await searchCmd.report!([queries] as any, { localOnly: true, ...flags })) as string);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  it('should find a component by matching keyword', async () => {
    expect(await searchReport(['foo'])).to.have.string('bar/foo');
  });

  it('should not find components that do not match', async () => {
    expect(await searchReport(['nonexistent'])).to.have.string('no matches in workspace');
  });

  it('should match case-insensitively', async () => {
    expect(await searchReport(['FOO'])).to.have.string('bar/foo');
  });

  it('should union and deduplicate results across multiple queries', async () => {
    const results = await search(['foo', 'bar', 'is-type']);
    const fooCount = results.local.filter((id) => id.includes('bar/foo')).length;
    expect(fooCount).to.equal(1);
    expect(results.local.some((id) => id.includes('is-type'))).to.be.true;
  });

  it('should return json output with --json flag', async () => {
    const results = await search(['foo'], { json: true });
    expect(results).to.have.property('local');
    expect(results).to.have.property('remote');
    expect(results).to.have.property('perQuery');
    expect(results).to.have.property('hasWorkspace', true);
    expect(results.local).to.be.an('array');
    const match = results.local.find((id) => id.includes('bar/foo'));
    expect(match).to.not.be.undefined;
  });
});
