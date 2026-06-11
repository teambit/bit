import { expect } from 'chai';
import type { Location as SchemaLocation, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APISchema, ModuleSchema, VariableLikeSchema, KeywordTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { ComponentID } from '@teambit/component-id';
import {
  computeAPIDiff,
  ImpactAssessor,
  DEFAULT_IMPACT_RULES,
} from '@teambit/semantics.entities.semantic-schema-diff';
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
});
