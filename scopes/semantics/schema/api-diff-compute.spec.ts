import { expect } from 'chai';
import type { Location as SchemaLocation, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APISchema, ModuleSchema, VariableLikeSchema, KeywordTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { ComponentID } from '@teambit/component-id';
import {
  computeAPIDiff,
  ImpactAssessor,
  DEFAULT_IMPACT_RULES,
} from '@teambit/semantics.entities.semantic-schema-diff';

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
