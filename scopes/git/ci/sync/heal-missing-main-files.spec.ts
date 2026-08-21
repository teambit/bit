import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { healMissingMainFiles } from './heal-missing-main-files';

const ID_STR = 'teambit.api-reference/renderers/schema-node-member-summary';
/** A version this repository never installed: an orphaned tag whose Version object is not on the fs. */
const STALE_VERSION = '0.0.0-75238957ce4bc43dee7758156dde5bc3a343e70d';
const SCOPE_HEAD = '0.0.85';
const ROOT_DIR = 'components/renderers/schema-node-member-summary';

/**
 * What the scope answers for the component. `absent` means `getModelComponentIfExist` resolves to
 * undefined; `headless` and `mainFileless` exercise the other two paths that also yield an `absent`
 * verdict, which must each report their own reason.
 */
type ScopeState = 'has-head' | 'absent' | 'headless' | 'mainFileless';

/**
 * Real heal code over stubbed deps. `getModelComponentIfExist` reproduces what made this fail:
 * `sources.get` is version-sensitive, so an id carrying a version whose Version object is absent
 * from the filesystem resolves to undefined, while the same id without a version resolves to the
 * component. `lookedUp` records every id the heal asked the scope for.
 */
function stubWorkspace(wsPath: string, scope: ScopeState, mainFileInBitmap = 'dist/index.d.ts') {
  const id = ComponentID.fromString(`${ID_STR}@${STALE_VERSION}`);
  const componentMap: any = { id, mainFile: mainFileInBitmap, rootDir: ROOT_DIR };
  const lookedUp: string[] = [];
  const removed: string[] = [];

  const modelComponent = {
    getHeadRegardlessOfLaneAsTagOrHash: () => (scope === 'headless' ? undefined : SCOPE_HEAD),
    loadVersion: async () => (scope === 'mainFileless' ? {} : { mainFile: 'index.ts' }),
  };

  const workspace: any = {
    path: wsPath,
    consumer: {
      bitMap: {
        components: [componentMap],
        markAsChanged: () => {},
        removeComponent: (compId: ComponentID) => removed.push(compId.toString()),
        write: async () => {},
      },
    },
    scope: {
      legacyScope: {
        objects: {},
        scopeImporter: { importWithoutDeps: async () => undefined },
        getModelComponentIfExist: async (asked: ComponentID) => {
          lookedUp.push(asked.toString());
          // The crux: a versioned lookup resolves to undefined even when the component is there.
          if (asked.hasVersion()) return undefined;
          return scope === 'absent' ? undefined : modelComponent;
        },
      },
    },
  };

  const warnings: string[] = [];
  const logger: any = { console: () => {}, consoleWarning: (msg: string) => warnings.push(msg) };
  return { workspace, logger, componentMap, lookedUp, warnings, removed };
}

describe('healMissingMainFiles', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-main-file-'));
    // The `.bitmap` entry points at dist/index.d.ts; only the source file is on disk.
    fs.outputFileSync(path.join(wsPath, ROOT_DIR, 'index.ts'), 'export {};\n');
  });

  afterEach(() => {
    fs.rmSync(wsPath, { recursive: true, force: true });
  });

  describe('when the .bitmap entry records a version the scope cannot resolve', () => {
    it('retargets the entry at the main file the scope head records', async () => {
      const { workspace, logger, componentMap } = stubWorkspace(wsPath, 'has-head');

      const healed = await healMissingMainFiles(workspace, logger);

      expect(healed).to.have.lengthOf(1);
      expect(healed[0].retargetedTo).to.equal('index.ts');
      expect(componentMap.mainFile).to.equal('index.ts');
    });

    // The regression guard. Looking the component up WITH the stale version made every scheduled
    // main sync decline for a component the scope had, and no amount of retrying could clear it.
    it('never asks the scope for the stale version, only for the component', async () => {
      const { workspace, logger, lookedUp } = stubWorkspace(wsPath, 'has-head');

      await healMissingMainFiles(workspace, logger);

      expect(lookedUp).to.have.lengthOf(1);
      expect(lookedUp[0]).to.equal(ID_STR);
      expect(lookedUp[0]).to.not.contain(STALE_VERSION);
    });
  });

  // All three leave the entry alone, so the reported reason is the only thing telling an operator
  // which one happened. A blanket wording here is what made this bug look like a scope problem.
  describe('when the scope cannot say what to repair to', () => {
    const cases: Array<{ scope: ScopeState; reason: string }> = [
      { scope: 'absent', reason: 'not on the scope' },
      { scope: 'headless', reason: 'no head on the scope' },
      { scope: 'mainFileless', reason: 'the head records no main file' },
    ];

    cases.forEach(({ scope, reason }) => {
      it(`reports "${reason}" and touches nothing`, async () => {
        const { workspace, logger, componentMap, warnings, removed } = stubWorkspace(wsPath, scope);

        const healed = await healMissingMainFiles(workspace, logger);

        expect(healed).to.have.lengthOf(0);
        expect(removed).to.have.lengthOf(0);
        expect(componentMap.mainFile).to.equal('dist/index.d.ts');
        expect(warnings.join('\n')).to.contain(`${ID_STR} (${reason})`);
      });
    });
  });

  it('does nothing when every recorded main file is on disk', async () => {
    const { workspace, logger, lookedUp } = stubWorkspace(wsPath, 'has-head', 'index.ts');

    const healed = await healMissingMainFiles(workspace, logger);

    expect(healed).to.have.lengthOf(0);
    expect(lookedUp).to.have.lengthOf(0);
  });
});
