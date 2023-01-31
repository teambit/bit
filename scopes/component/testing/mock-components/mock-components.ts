import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { InstallMain, InstallAspect } from '@teambit/install';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';
import TrackerAspect, { TrackerMain } from '@teambit/tracker';

/**
 * create dummy components, add, link and compile them.
 * if `numOfComponents` is more than one, the components will depend on each other. by default, it's one.
 */
export async function mockComponents(workspacePath: string, { numOfComponents = 1, additionalStr = '' } = {}) {
  const compsDirs = await createComponents(workspacePath, { numOfComponents, additionalStr });
  const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect, InstallAspect, CompilerAspect], workspacePath);
  const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
  const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
  await pMapSeries(compsDirs, async (compDir) => {
    await tracker.track({ rootDir: compDir });
  });
  await workspace.bitMap.write();
  const install = harmony.get<InstallMain>(InstallAspect.id);
  await install.link({ rewire: true });

  const compiler = harmony.get<CompilerMain>(CompilerAspect.id);
  await compiler.compileOnWorkspace();
}

/**
 * make the mocked components modified by appending the `additionalStr` to the component files
 */
export async function modifyMockedComponents(workspacePath: string, additionalStr = ' ', { numOfComponents = 1 } = {}) {
  await createComponents(workspacePath, { numOfComponents, additionalStr });
}

async function createComponents(
  workspacePath: string,
  { numOfComponents = 1, additionalStr = '' } = {}
): Promise<string[]> {
  const getImp = (index) => {
    if (index === numOfComponents) return `module.exports = () => 'comp${index}${additionalStr}';`;
    const nextComp = `comp${index + 1}`;
    return `const ${nextComp} = require('../${nextComp}');
module.exports = () => 'comp${index}${additionalStr} and ' + ${nextComp}();`;
  };

  const numOfComponentsArr = Array(numOfComponents).fill(null);
  return pMapSeries(numOfComponentsArr, async (val, key) => {
    const i = key + 1;
    const compDir = path.join(workspacePath, `comp${i}`);
    await fs.outputFile(path.join(compDir, `index.js`), getImp(i));
    return compDir;
  });
}
