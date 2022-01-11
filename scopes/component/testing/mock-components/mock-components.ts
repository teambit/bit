import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';

export async function mockComponents(workspacePath: string, { numOfComponents = 1, additionalStr = '' } = {}) {
  const getImp = (index) => {
    if (index === numOfComponents) return `module.exports = () => 'comp${index}${additionalStr}';`;
    const nextComp = `comp${index + 1}`;
    return `const ${nextComp} = require('../${nextComp}');
module.exports = () => 'comp${index}${additionalStr} and ' + ${nextComp}();`;
  };

  const workspace: Workspace = await loadAspect(WorkspaceAspect, workspacePath);
  const numOfComponentsArr = Array(numOfComponents).fill(null);
  await pMapSeries(numOfComponentsArr, async (val, key) => {
    const i = key + 1;
    const compDir = path.join(workspacePath, `comp${i}`);
    await fs.outputFile(path.join(compDir, `index.js`), getImp(i));
    await workspace.track({ rootDir: compDir });
  });
  await workspace.bitMap.write();
  await workspace.link({ rewire: true, consumer: workspace.consumer });

  const compiler: CompilerMain = await loadAspect(CompilerAspect, workspacePath);
  await compiler.compileOnWorkspace();
}
