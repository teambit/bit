import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { BitMap as LegacyBitMap, ComponentMap } from '@teambit/legacy.bit-map';
import type { Consumer } from '@teambit/legacy.consumer';
import { BitMap } from './bit-map';

const compId = ComponentID.fromString('teambit.scope/comp1');
const envId = 'teambit.node/envs/node-babel-mocha@2.0.5';
const otherAspectId = 'teambit.pkg/pkg';

/**
 * wrap a single .bitmap entry, so the config-mutating methods can be tested in isolation.
 * when `config` is undefined, the entry has no `config` property at all, as it is in a .bitmap file.
 */
function bitMapWithEntry(config?: Record<string, any>) {
  const entry = {} as ComponentMap;
  if (config) entry.config = config;
  const markedAsChanged = { count: 0 };
  const legacyBitMap = {
    getComponent: () => entry,
    markAsChanged: () => {
      markedAsChanged.count += 1;
    },
  } as unknown as LegacyBitMap;
  return { bitMap: new BitMap(legacyBitMap, {} as Consumer), entry, markedAsChanged };
}

describe('BitMap', () => {
  describe('removeComponentConfig', () => {
    it('should delete the entire config object once the last aspect was removed', () => {
      const { bitMap, entry } = bitMapWithEntry({ [envId]: {} });
      expect(bitMap.removeComponentConfig(compId, envId, false)).to.be.true;
      // an empty `config: {}` is meaningless in .bitmap, it should not be left behind
      expect(entry).to.not.have.property('config');
    });

    it('should keep the other aspects when one of several is removed', () => {
      const { bitMap, entry } = bitMapWithEntry({ [envId]: {}, [otherAspectId]: { some: 'config' } });
      expect(bitMap.removeComponentConfig(compId, envId, false)).to.be.true;
      expect(entry.config).to.deep.equal({ [otherAspectId]: { some: 'config' } });
    });

    it('should not create a config object when the aspect is not configured', () => {
      const { bitMap, entry } = bitMapWithEntry();
      expect(bitMap.removeComponentConfig(compId, envId, false)).to.be.false;
      expect(entry).to.not.have.property('config');
    });

    it('should mark the aspect with "-" when markWithMinusIfNotExist is true', () => {
      const { bitMap, entry } = bitMapWithEntry();
      expect(bitMap.removeComponentConfig(compId, envId, true)).to.be.true;
      // "-" is what actually removes an aspect that comes from the model. it must keep working.
      expect(entry.config).to.deep.equal({ [envId]: '-' });
    });
  });

  describe('addComponentConfig', () => {
    it('should add the aspect config when the entry has no config yet', () => {
      const { bitMap, entry } = bitMapWithEntry();
      expect(bitMap.addComponentConfig(compId, envId)).to.be.true;
      expect(entry.config).to.deep.equal({ [envId]: {} });
    });

    it('should delete the entire config object when the last aspect config is nullified', () => {
      const { bitMap, entry } = bitMapWithEntry({ [envId]: {} });
      expect(bitMap.addComponentConfig(compId, envId, null as any)).to.be.true;
      expect(entry).to.not.have.property('config');
    });

    it('should report no change when nullifying an aspect while the entry has no config', () => {
      const { bitMap, entry, markedAsChanged } = bitMapWithEntry();
      expect(bitMap.addComponentConfig(compId, envId, null as any)).to.be.false;
      expect(entry).to.not.have.property('config');
      // nothing was mutated, so the .bitmap must not be marked as changed
      expect(markedAsChanged.count).to.equal(0);
    });

    it('should report no change when nullifying an aspect that is not configured', () => {
      const { bitMap, entry, markedAsChanged } = bitMapWithEntry({ [otherAspectId]: { some: 'config' } });
      expect(bitMap.addComponentConfig(compId, envId, null as any)).to.be.false;
      expect(entry.config).to.deep.equal({ [otherAspectId]: { some: 'config' } });
      expect(markedAsChanged.count).to.equal(0);
    });
  });
});
