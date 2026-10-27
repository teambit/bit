import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import Lane from './lane';
import { Ref } from '../objects';

const id = (name: string, version?: string) => ComponentID.fromObject({ scope: 'acme.ui', name, version });
const ref = (i: number) => new Ref(i.toString(16).padStart(40, '0'));
const laneWith = (...names: string[]) => {
  const lane = new Lane({ name: 'dev', scope: 'acme.ui', hash: 'f'.repeat(40), log: { date: '0' } });
  names.forEach((name, i) => lane.addComponent({ id: id(name), head: ref(i) }));
  return lane;
};

describe('Lane', () => {
  describe('getComponent', () => {
    it('should find a component by scope and name, regardless of the version of the given id', () => {
      const lane = laneWith('button', 'card');
      expect(lane.getComponent(id('card', '1.0.0'))?.head.toString()).to.equal(ref(1).toString());
    });
    it('should return undefined for a component that is not in the lane', () => {
      expect(laneWith('button').getComponent(id('card'))).to.be.undefined;
    });
    it('should find a component added after a lookup, and the new head of one added again', () => {
      const lane = laneWith('button');
      expect(lane.getComponent(id('card'))).to.be.undefined;
      lane.addComponent({ id: id('card'), head: ref(7) });
      expect(lane.getComponent(id('card'))?.head.toString()).to.equal(ref(7).toString());
      lane.addComponent({ id: id('card'), head: ref(8) });
      expect(lane.getComponent(id('card'))?.head.toString()).to.equal(ref(8).toString());
      expect(lane.components).to.have.lengthOf(2);
    });
    it('should not find a component after it was removed', () => {
      const lane = laneWith('button', 'card');
      expect(lane.getComponent(id('button'))).to.not.be.undefined;
      lane.removeComponent(id('button'));
      expect(lane.getComponent(id('button'))).to.be.undefined;
      expect(lane.getComponent(id('card'))).to.not.be.undefined;
    });
    it('should find the components set after a lookup', () => {
      const lane = laneWith('button');
      lane.getComponent(id('button'));
      lane.setLaneComponents([{ id: id('card'), head: ref(3) }]);
      expect(lane.getComponent(id('button'))).to.be.undefined;
      expect(lane.getComponent(id('card'))?.head.toString()).to.equal(ref(3).toString());
    });
    it('should find a component pushed directly to the components array after a lookup', () => {
      const lane = laneWith('button');
      lane.getComponent(id('button'));
      lane.components.push({ id: id('card'), head: ref(4) });
      expect(lane.getComponent(id('card'))?.head.toString()).to.equal(ref(4).toString());
    });
  });
  describe('getComponentExact', () => {
    it('should find a component only when the version of the given id matches as well', () => {
      const lane = laneWith('button');
      expect(lane.getComponentExact(id('button'))?.head.toString()).to.equal(ref(0).toString());
      expect(lane.getComponentExact(id('button', '1.0.0'))).to.be.undefined;
    });
  });
  describe('getComponentHead', () => {
    it('should return the head of the component, or null when it is not in the lane', () => {
      const lane = laneWith('button');
      expect(lane.getComponentHead(id('button'))?.toString()).to.equal(ref(0).toString());
      expect(lane.getComponentHead(id('card'))).to.be.null;
    });
  });
});
