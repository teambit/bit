import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { TrackerAspect } from './tracker.aspect';
import type { TrackerMain } from './tracker.main.runtime';

/**
 * which files `bit add` ends up tracking. one harmony load stands in for a process per command, so
 * the rules that pick the files are covered here rather than as e2e.
 */
describe('the files bit add tracks', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let addedFiles: string[];

  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    const write = (relPath: string, content: string) => fs.outputFileSync(path.join(workspacePath, relPath), content);
    write('comp1/index.js', 'module.exports = () => "comp1";\n');
    write('comp1/.bitignore', '*.json\n');
    write('comp1/hello.json', '{ "hello": "world" }\n');
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspacePath);
    const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
    const results = await tracker.addForCLI({
      componentPaths: [path.join(workspacePath, 'comp1')],
      id: 'comp1',
      override: false,
    });
    addedFiles = results.addedComponents[0].files.map((file) => file.relativePath);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  it('should apply the ignore file of the component being added, as the rescan does', () => {
    expect(addedFiles).to.include('index.js');
    expect(addedFiles).to.not.include('hello.json');
  });
  it('should keep the ignore file itself, it is a source of the component', () => {
    expect(addedFiles).to.include('.bitignore');
  });
});
