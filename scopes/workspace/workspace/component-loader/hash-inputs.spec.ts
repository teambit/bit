import { expect } from 'chai';
import { getHashInputs } from './hash-inputs';
import type { HashInputContext } from './hash-inputs';
import { PHASES } from './phase';

const baseCtx: HashInputContext = {
  idStr: 'teambit.foo/bar',
  bitmapHash: 'bm-1',
  fileSignature: 'fs-1',
  componentConfigHash: 'cc-1',
  workspaceConfigHash: 'wc-1',
  aspectStateHash: 'as-1',
};

describe('getHashInputs', () => {
  describe('phase fields included', () => {
    it('identity uses only id + bitmap', () => {
      const out = getHashInputs('identity', baseCtx);
      expect(out).to.contain('id=teambit.foo/bar');
      expect(out).to.contain('bitmap=bm-1');
      expect(out).to.not.contain('files=');
      expect(out).to.not.contain('compConfig=');
      expect(out).to.not.contain('wsConfig=');
      expect(out).to.not.contain('aspects=');
    });

    it('files adds the file signature', () => {
      const out = getHashInputs('files', baseCtx);
      expect(out).to.contain('files=fs-1');
      expect(out).to.not.contain('compConfig=');
      expect(out).to.not.contain('wsConfig=');
      expect(out).to.not.contain('aspects=');
    });

    it('dependencies adds the component config hash', () => {
      const out = getHashInputs('dependencies', baseCtx);
      expect(out).to.contain('files=fs-1');
      expect(out).to.contain('compConfig=cc-1');
      expect(out).to.not.contain('wsConfig=');
      expect(out).to.not.contain('aspects=');
    });

    it('extensions adds the workspace config hash', () => {
      const out = getHashInputs('extensions', baseCtx);
      expect(out).to.contain('compConfig=cc-1');
      expect(out).to.contain('wsConfig=wc-1');
      expect(out).to.not.contain('aspects=');
    });

    it('aspects adds the aspect state hash', () => {
      const out = getHashInputs('aspects', baseCtx);
      expect(out).to.contain('wsConfig=wc-1');
      expect(out).to.contain('aspects=as-1');
    });
  });

  describe('determinism', () => {
    it('returns identical strings for identical inputs', () => {
      const a = getHashInputs('extensions', baseCtx);
      const b = getHashInputs('extensions', { ...baseCtx });
      expect(a).to.equal(b);
    });

    it('changes when any included input changes', () => {
      const original = getHashInputs('dependencies', baseCtx);
      expect(getHashInputs('dependencies', { ...baseCtx, fileSignature: 'fs-2' })).to.not.equal(original);
      expect(getHashInputs('dependencies', { ...baseCtx, bitmapHash: 'bm-2' })).to.not.equal(original);
      expect(getHashInputs('dependencies', { ...baseCtx, componentConfigHash: 'cc-2' })).to.not.equal(original);
    });

    it('does NOT change when an excluded input changes', () => {
      const original = getHashInputs('files', baseCtx);
      // The aspectStateHash is irrelevant at the files phase, so a change to it
      // must not affect the hash.
      expect(getHashInputs('files', { ...baseCtx, aspectStateHash: 'something-else' })).to.equal(original);
      expect(getHashInputs('files', { ...baseCtx, workspaceConfigHash: 'something-else' })).to.equal(original);
    });

    it('different phases produce different strings even with identical inputs', () => {
      const phasesSeen = new Set<string>();
      for (const phase of PHASES) {
        const out = getHashInputs(phase, baseCtx);
        expect(phasesSeen.has(out)).to.equal(false, `duplicate hash for phase ${phase}`);
        phasesSeen.add(out);
      }
    });
  });

  describe('required fields', () => {
    it('throws when files phase is missing fileSignature', () => {
      expect(() => getHashInputs('files', { idStr: 'x', bitmapHash: 'b' })).to.throw(/requires "fileSignature"/);
    });

    it('throws when dependencies phase is missing componentConfigHash', () => {
      expect(() =>
        getHashInputs('dependencies', {
          idStr: 'x',
          bitmapHash: 'b',
          fileSignature: 'f',
        })
      ).to.throw(/requires "componentConfigHash"/);
    });

    it('throws when extensions phase is missing workspaceConfigHash', () => {
      expect(() =>
        getHashInputs('extensions', {
          idStr: 'x',
          bitmapHash: 'b',
          fileSignature: 'f',
          componentConfigHash: 'cc',
        })
      ).to.throw(/requires "workspaceConfigHash"/);
    });

    it('throws when aspects phase is missing aspectStateHash', () => {
      expect(() =>
        getHashInputs('aspects', {
          idStr: 'x',
          bitmapHash: 'b',
          fileSignature: 'f',
          componentConfigHash: 'cc',
          workspaceConfigHash: 'wc',
        })
      ).to.throw(/requires "aspectStateHash"/);
    });

    it('does NOT require higher-phase fields at lower phases', () => {
      expect(() => getHashInputs('identity', { idStr: 'x', bitmapHash: 'b' })).to.not.throw();
      expect(() => getHashInputs('files', { idStr: 'x', bitmapHash: 'b', fileSignature: 'f' })).to.not.throw();
    });
  });
});
