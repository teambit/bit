import { expect } from 'chai';
import type { Location as SchemaLocation, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  APISchema,
  ModuleSchema,
  VariableLikeSchema,
  KeywordTypeSchema,
  TypeRefSchema,
  ExportSchema,
  UnImplementedSchema,
  UnresolvedSchema,
  DocSchema,
  FunctionLikeSchema,
  InferenceTypeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { ComponentID } from '@teambit/component-id';
import { computeAPIDiff, ImpactAssessor, DEFAULT_IMPACT_RULES } from '@teambit/semantics.entities.semantic-schema-diff';
import { SchemaMain } from './schema.main.runtime';

const loc: SchemaLocation = { filePath: 'index.ts', line: 0, character: 0 };
const compId = ComponentID.fromString('org.scope/button');

function makeVar(name: string, type: string): VariableLikeSchema {
  return new VariableLikeSchema(loc, name, `${name}: ${type}`, new KeywordTypeSchema(loc, type), false);
}

function makeSchema(exports: SchemaNode[], internals: SchemaNode[] = []): APISchema {
  const internalModules = internals.length > 0 ? [new ModuleSchema(loc, [], internals)] : [];
  return new APISchema(loc, new ModuleSchema(loc, exports, []), internalModules, compId);
}

function makeAssessor(): ImpactAssessor {
  const assessor = new ImpactAssessor();
  assessor.registerDefaultRules(DEFAULT_IMPACT_RULES);
  return assessor;
}

describe('computeAPIDiff', () => {
  describe('availability short-circuit', () => {
    const unavailable = { available: false, reason: 'NOT_BUILT' as const };
    const available = { available: true };

    it('should not fabricate a diff when the base schema is unavailable', () => {
      const result = computeAPIDiff(makeSchema([]), makeSchema([makeVar('foo', 'string')]), makeAssessor(), {
        base: unavailable,
        compare: available,
      });
      expect(result.status).to.equal('BASE_UNAVAILABLE');
      expect(result.hasChanges).to.be.false;
      expect(result.changes).to.have.length(0);
      expect(result.base).to.deep.equal(unavailable);
      expect(result.compare).to.deep.equal(available);
    });

    it('should not fabricate a diff when the compare schema is unavailable', () => {
      const result = computeAPIDiff(makeSchema([makeVar('foo', 'string')]), makeSchema([]), makeAssessor(), {
        base: available,
        compare: unavailable,
      });
      expect(result.status).to.equal('COMPARE_UNAVAILABLE');
      expect(result.hasChanges).to.be.false;
      expect(result.changes).to.have.length(0);
    });

    it('should report UNAVAILABLE when both schemas are unavailable', () => {
      const result = computeAPIDiff(makeSchema([]), makeSchema([]), makeAssessor(), {
        base: unavailable,
        compare: { available: false, reason: 'NO_EXTRACTOR' },
      });
      expect(result.status).to.equal('UNAVAILABLE');
      expect(result.hasChanges).to.be.false;
      expect(result.compare.reason).to.equal('NO_EXTRACTOR');
    });

    it('should default to available and report COMPUTED', () => {
      const result = computeAPIDiff(makeSchema([]), makeSchema([makeVar('foo', 'string')]), makeAssessor());
      expect(result.status).to.equal('COMPUTED');
      expect(result.base.available).to.be.true;
      expect(result.compare.available).to.be.true;
      expect(result.hasChanges).to.be.true;
      expect(result.added).to.equal(1);
    });
  });

  describe('impact derivation', () => {
    it('should derive impact from public changes only', () => {
      // internal-only breaking change: internal var type narrowed string → number
      const base = makeSchema([makeVar('Button', 'string')], [makeVar('helper', 'string')]);
      const compare = makeSchema([makeVar('Button', 'string')], [makeVar('helper', 'number')]);
      const result = computeAPIDiff(base, compare, makeAssessor());

      expect(result.publicChanges).to.have.length(0);
      expect(result.internalChanges).to.have.length(1);
      expect(result.impact).to.equal('PATCH');
      expect(result.internalImpact).to.equal('BREAKING');
      expect(result.hasChanges).to.be.true;
    });

    it('should reflect public breaking changes in impact', () => {
      const base = makeSchema([makeVar('Button', 'string')]);
      const compare = makeSchema([]);
      const result = computeAPIDiff(base, compare, makeAssessor());

      expect(result.removed).to.equal(1);
      expect(result.impact).to.equal('BREAKING');
      expect(result.internalImpact).to.equal('PATCH');
    });
  });
});

describe('computeAPIDiff default/re-export aliases (extraction-inconsistency robustness)', () => {
  // Repro of a real false positive: `class AttReact` + `export default AttReact`. Across two builds
  // the default export was extracted inconsistently — an UnImplementedSchema one version, a
  // `AttReact (default)` TypeRef alias the next — while only the docs changed. The diff must not
  // report the default re-export alias as a newly added public API.
  const classExport = () => new ExportSchema(loc, 'AttReact', makeVar('AttReact', 'string'));
  const defaultAsUnimplemented = () => new UnImplementedSchema(loc, 'AttReact', 'Identifier');
  const defaultAsTypeRefAlias = () =>
    new ExportSchema(loc, 'AttReact (default)', new TypeRefSchema(loc, 'AttReact'), 'AttReact (default)');

  it('should not report an added export when the default re-export alias changes representation', () => {
    const base = makeSchema([classExport(), defaultAsUnimplemented()]);
    const compare = makeSchema([classExport(), defaultAsTypeRefAlias()]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.hasChanges).to.equal(false);
    expect(result.added).to.equal(0);
    expect(result.publicChanges).to.have.lengthOf(0);
  });

  it('should drop a redundant default type-ref alias to an already-exported symbol', () => {
    const base = makeSchema([classExport()]);
    const compare = makeSchema([classExport(), defaultAsTypeRefAlias()]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.added).to.equal(0);
    expect(result.hasChanges).to.equal(false);
  });

  it('should still report a genuinely new export alongside a redundant alias', () => {
    const base = makeSchema([classExport()]);
    const compare = makeSchema([classExport(), defaultAsTypeRefAlias(), makeVar('brandNew', 'string')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.added).to.equal(1);
    expect(result.publicChanges.map((c) => c.exportName)).to.include('brandNew');
    expect(result.publicChanges.map((c) => c.exportName)).to.not.include('AttReact (default)');
  });
});

describe('computeAPIDiff unresolved exports (extraction gaps)', () => {
  const unresolved = (name: string) => new UnImplementedSchema(loc, name, 'Identifier');

  it('should not report a removal when the export is merely unresolved on the compare side', () => {
    const base = makeSchema([makeVar('Foo', 'string')]);
    const compare = makeSchema([unresolved('Foo')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.removed).to.equal(0);
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('Foo');
  });

  it('should not report an addition when the export was merely unresolved on the base side', () => {
    const base = makeSchema([unresolved('Foo')]);
    const compare = makeSchema([makeVar('Foo', 'string')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.added).to.equal(0);
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('Foo');
  });

  it('should surface an export unresolved on both sides without diffing it', () => {
    const base = makeSchema([unresolved('Foo'), makeVar('Bar', 'string')]);
    const compare = makeSchema([unresolved('Foo'), makeVar('Bar', 'string')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('Foo');
  });

  it('should NOT surface a name that is unresolved on one side but resolved elsewhere (real export wins)', () => {
    // mirrors AttReact: a class export + an unresolved default that shares the class name.
    const base = makeSchema([makeVar('AttReact', 'string'), unresolved('AttReact')]);
    const compare = makeSchema([makeVar('AttReact', 'string')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.have.lengthOf(0);
  });
});

describe('computeAPIDiff UnresolvedSchema placeholders (degraded extraction)', () => {
  // Repro of a real false positive: one side's extraction degraded every re-export to an
  // `UnresolvedSchema` placeholder (no structure, no doc) while the other side came from a healthy
  // build. The diff reported every documented export as MODIFIED "documentation removed" labeled
  // "Unresolved" instead of routing the name to `unresolvedExports`.
  const docs = new DocSchema(loc, '/** backend server interface. */', 'backend server interface.');
  const documentedVar = (name: string) =>
    new VariableLikeSchema(loc, name, `${name}: string`, new KeywordTypeSchema(loc, 'string'), false, docs);

  it('should not diff a documented export against an UnresolvedSchema placeholder on the compare side', () => {
    const base = makeSchema([documentedVar('BackendServer')]);
    const compare = makeSchema([new UnresolvedSchema(loc, 'BackendServer')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.modified).to.equal(0);
    expect(result.removed).to.equal(0);
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('BackendServer');
  });

  it('should not diff an UnresolvedSchema placeholder on the base side against a real export', () => {
    const base = makeSchema([new UnresolvedSchema(loc, 'BackendServer')]);
    const compare = makeSchema([documentedVar('BackendServer')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.modified).to.equal(0);
    expect(result.added).to.equal(0);
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('BackendServer');
  });

  it('should handle an export-wrapped UnresolvedSchema like a bare one', () => {
    const base = makeSchema([documentedVar('Middleware')]);
    const compare = makeSchema([new ExportSchema(loc, 'Middleware', new UnresolvedSchema(loc, 'Middleware'))]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.hasChanges).to.equal(false);
    expect(result.unresolvedExports).to.include('Middleware');
  });

  it('should suppress internal placeholder-vs-real pairs without surfacing them as unresolved exports', () => {
    const base = makeSchema([], [documentedVar('helper')]);
    const compare = makeSchema([], [new UnresolvedSchema(loc, 'helper')]);
    const result = computeAPIDiff(base, compare, makeAssessor());
    expect(result.internalChanges).to.have.lengthOf(0);
    expect(result.hasChanges).to.equal(false);
    // internal extraction gaps are suppressed, not reported as unresolved *exports*
    expect(result.unresolvedExports).to.have.lengthOf(0);
  });
});

describe('computeAPIDiff visibility moves', () => {
  it('should report a public→internal move as a public BREAKING change (drives impact, not internalImpact)', () => {
    const base = makeSchema([makeVar('foo', 'string')], []);
    const compare = makeSchema([], [makeVar('foo', 'string')]);
    const result = computeAPIDiff(base, compare, makeAssessor());

    expect(result.publicChanges).to.have.length(1);
    expect(result.publicChanges[0].changes?.[0]?.changeKind).to.equal('visibility-public-to-internal');
    expect(result.impact).to.equal('BREAKING');
  });
});

describe('SchemaMain.getSchemaWithAvailability reason mapping', () => {
  const succeedStatus = 'succeed';
  const loggerStub = { warn: () => {}, debug: () => {}, error: () => {}, info: () => {} } as any;

  function makeComponent(buildStatus = 'pending') {
    return { id: ComponentID.fromString('org.scope/button'), buildStatus } as any;
  }

  function makeSchemaMain({
    disabled = false,
    workspace = {} as any,
    env = {} as any,
    artifacts = [] as any[],
  } = {}): SchemaMain {
    const envs = { getEnv: () => ({ env }) } as any;
    const builder = { getArtifactsVinylByAspectAndTaskName: async () => artifacts } as any;
    const config = { defaultParser: 'typescript', disabled } as any;
    return new SchemaMain(
      undefined as any,
      undefined as any,
      envs,
      config,
      builder,
      workspace,
      loggerStub,
      new ImpactAssessor()
    );
  }

  it('should report DISABLED when schema extraction is disabled by config', async () => {
    const schemaMain = makeSchemaMain({ disabled: true });
    const { availability } = await schemaMain.getSchemaWithAvailability(makeComponent());
    expect(availability).to.deep.equal({ available: false, reason: 'DISABLED' });
  });

  it('should report NO_EXTRACTOR when the env has no schema extractor', async () => {
    const schemaMain = makeSchemaMain({ env: { name: 'stub-env' } });
    const { availability } = await schemaMain.getSchemaWithAvailability(makeComponent());
    expect(availability).to.deep.equal({ available: false, reason: 'NO_EXTRACTOR' });
  });

  it('should report FAILED when extraction throws and no artifact exists', async () => {
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => {
          throw new Error('boom');
        },
        dispose: () => {},
      }),
    };
    const schemaMain = makeSchemaMain({ env });
    const { availability } = await schemaMain.getSchemaWithAvailability(makeComponent());
    expect(availability).to.deep.equal({ available: false, reason: 'FAILED' });
  });

  it('should report NOT_BUILT for a built/scope component without a schema artifact', async () => {
    const schemaMain = makeSchemaMain({ workspace: undefined as any });
    const { availability } = await schemaMain.getSchemaWithAvailability(makeComponent(succeedStatus));
    expect(availability).to.deep.equal({ available: false, reason: 'NOT_BUILT' });
  });

  it('should report available when a schema artifact exists', async () => {
    const schemaJson = APISchema.empty(ComponentID.fromString('org.scope/button')).toObject();
    const artifacts = [{ contents: Buffer.from(JSON.stringify(schemaJson)) }];
    const schemaMain = makeSchemaMain({ workspace: undefined as any, artifacts });
    const { schema, availability } = await schemaMain.getSchemaWithAvailability(makeComponent(succeedStatus));
    expect(availability).to.deep.equal({ available: true });
    expect(schema.module.exports).to.have.length(0);
  });

  it('should rethrow extraction errors when alwaysRunExtractor is set', async () => {
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => {
          throw new Error('boom');
        },
        dispose: () => {},
      }),
    };
    const schemaMain = makeSchemaMain({ env });
    try {
      await schemaMain.getSchemaWithAvailability(makeComponent(), false, true);
      expect.fail('expected getSchemaWithAvailability to rethrow');
    } catch (err: any) {
      expect(err.message).to.equal('boom');
    }
  });

  it('should flag a live-extracted schema so version-keyed consumers do not persist it', async () => {
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => makeSchema([makeVar('Foo', 'string')]),
        dispose: () => {},
      }),
    };
    const schemaMain = makeSchemaMain({ env });
    const { availability } = await schemaMain.getSchemaWithAvailability(makeComponent());
    expect(availability.available).to.equal(true);
    expect(availability.live).to.equal(true);
  });
});

describe('SchemaMain.computeAPIDiff schema sourcing', () => {
  const loggerStub = { warn: () => {}, debug: () => {}, error: () => {}, info: () => {} } as any;

  function makeDiffSchemaMain({ workspace, env, artifacts }: { workspace: any; env: any; artifacts: any[] }) {
    const envs = { getEnv: () => ({ env }) } as any;
    const builder = { getArtifactsVinylByAspectAndTaskName: async () => artifacts } as any;
    const config = { defaultParser: 'typescript', disabled: false } as any;
    const impactRuleSlot = { values: () => [] } as any;
    return new SchemaMain(
      undefined as any,
      impactRuleSlot,
      envs,
      config,
      builder,
      workspace,
      loggerStub,
      new ImpactAssessor()
    );
  }

  const makeComp = (idStr: string) => ({ id: ComponentID.fromString(idStr), buildStatus: 'pending' }) as any;
  const artifactOf = (schema: APISchema) => [{ contents: Buffer.from(JSON.stringify(schema.toObject())) }];

  it('should read the built artifact — not live-extract — for an unmodified checkout, and memoize', async () => {
    // repro: a checked-out CI-built snap reports buildStatus "pending", which used to force a
    // tsserver extraction pass per component per diff (minutes on a cold lane-compare) whose
    // degraded output was then cached under the immutable snap pair.
    let extracted = 0;
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => {
          extracted += 1;
          return makeSchema([]);
        },
        dispose: () => {},
      }),
    };
    const workspace = { getIdIfExist: (id: ComponentID) => id, isModified: async () => false } as any;
    const schemaMain = makeDiffSchemaMain({ workspace, env, artifacts: artifactOf(makeSchema([])) });

    const result = await schemaMain.computeAPIDiff(
      makeComp('org.scope/button@0.0.1'),
      makeComp('org.scope/button@0.0.2')
    );
    expect(result?.status).to.equal('COMPUTED');
    expect(extracted).to.equal(0);
    expect(result?.base.live).to.equal(undefined);

    // artifact-derived result is immutable even with buildStatus "pending" — memoized
    const again = await schemaMain.computeAPIDiff(
      makeComp('org.scope/button@0.0.1'),
      makeComp('org.scope/button@0.0.2')
    );
    expect(again).to.equal(result);
  });

  it('should live-extract for a modified checkout and never memoize that result', async () => {
    let extracted = 0;
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => {
          extracted += 1;
          return makeSchema([makeVar('Foo', 'string')]);
        },
        dispose: () => {},
      }),
    };
    const workspace = { getIdIfExist: (id: ComponentID) => id, isModified: async () => true } as any;
    const schemaMain = makeDiffSchemaMain({ workspace, env, artifacts: artifactOf(makeSchema([])) });

    const result = await schemaMain.computeAPIDiff(
      makeComp('org.scope/button@0.0.1'),
      makeComp('org.scope/button@0.0.2')
    );
    expect(result?.status).to.equal('COMPUTED');
    expect(extracted).to.equal(2); // both sides extracted live, artifact bypassed
    expect(result?.base.live).to.equal(true);
    expect(result?.compare.live).to.equal(true);

    const again = await schemaMain.computeAPIDiff(
      makeComp('org.scope/button@0.0.1'),
      makeComp('org.scope/button@0.0.2')
    );
    expect(again).to.not.equal(result); // live results are recomputed, never served from memo
    expect(extracted).to.equal(4);
  });

  it('should read the artifact for a version that is not checked out in the workspace', async () => {
    let extracted = 0;
    const env = {
      name: 'stub-env',
      getSchemaExtractor: () => ({
        extract: async () => {
          extracted += 1;
          return makeSchema([]);
        },
        dispose: () => {},
      }),
    };
    // checked out at a different version than either diff side
    const workspace = {
      getIdIfExist: (id: ComponentID) => id.changeVersion('9.9.9'),
      isModified: async () => true,
    } as any;
    const schemaMain = makeDiffSchemaMain({ workspace, env, artifacts: artifactOf(makeSchema([])) });

    const result = await schemaMain.computeAPIDiff(
      makeComp('org.scope/button@0.0.1'),
      makeComp('org.scope/button@0.0.2')
    );
    expect(result?.status).to.equal('COMPUTED');
    expect(extracted).to.equal(0);
  });
});

describe('computeAPIDiff self-referential returnType (degraded extraction)', () => {
  // Repro of a real artifact: a component fn `Checkbox` extracted while React types were unresolved.
  // quickinfo (and thus the stored signature) said `…): any`, but the extractor's definition-hunt
  // resolved the function's own name and stored returnType = TypeRefSchema('Checkbox'). The diff
  // must trust the signature in that case — showing "React.JSX.Element → Checkbox" while the
  // signature snippet right above it shows "…): any" reads as nonsense.
  const makeFn = (returnType: SchemaNode, signatureReturn: string) =>
    new FunctionLikeSchema(
      loc,
      'Checkbox',
      [],
      returnType,
      `function Checkbox(props: CheckboxProps): ${signatureReturn}`,
      []
    );

  it('should prefer the signature return annotation when the returnType node is a self-reference', () => {
    const base = makeSchema([makeFn(new InferenceTypeSchema(loc, 'React.JSX.Element'), 'React.JSX.Element')]);
    const compare = makeSchema([makeFn(new TypeRefSchema(loc, 'Checkbox'), 'any')]);
    const result = computeAPIDiff(base, compare, makeAssessor());

    const fact = result.publicChanges[0]?.changes?.find((c) => c.changeKind === 'return-type-changed');
    expect(fact, 'expected a return-type-changed fact').to.exist;
    expect(fact?.from).to.equal('React.JSX.Element');
    expect(fact?.to).to.equal('any');
  });

  it('should keep the node rendering when a self-named return type agrees with the signature', () => {
    // legit pattern: function merged with a same-named interface, genuinely returning `Checkbox`.
    const base = makeSchema([makeFn(new InferenceTypeSchema(loc, 'React.JSX.Element'), 'React.JSX.Element')]);
    const compare = makeSchema([makeFn(new TypeRefSchema(loc, 'Checkbox'), 'Checkbox')]);
    const result = computeAPIDiff(base, compare, makeAssessor());

    const fact = result.publicChanges[0]?.changes?.find((c) => c.changeKind === 'return-type-changed');
    expect(fact?.to).to.equal('Checkbox');
  });
});
