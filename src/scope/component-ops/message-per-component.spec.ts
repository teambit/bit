import { expect } from 'chai';
import { BitId, BitIds } from '../../bit-id';
import { MessagePerComponentFetcher } from './message-per-component';

function getInstance() {
  return new MessagePerComponentFetcher(new BitIds(new BitId({ name: 'bar' })), new BitIds());
}

describe('MessagePerComponent', () => {
  describe('parseFileWithMessages', () => {
    it('should throw an error when the file has no changes', () => {
      const messagePerComponent = getInstance();
      const template = messagePerComponent.getTemplate();
      expect(() => messagePerComponent.parseFileWithMessages(template)).to.throw();
    });
    it('should assign the default message to the component if empty', () => {
      const messagePerComponent = getInstance();
      const template = messagePerComponent.getTemplate();
      const templateChanged = template.replace('DEFAULT:', `DEFAULT: my default msg`);
      const parsed = messagePerComponent.parseFileWithMessages(templateChanged);
      expect(parsed[0].msg).to.equal('my default msg');
    });
    it('should support multiple lines per id', () => {
      const messagePerComponent = getInstance();
      const template = messagePerComponent.getTemplate();
      const msgWithNewLine = 'msg for bar\nAnother line';
      const templateChanged = template.replace('bar:', `bar: ${msgWithNewLine}`);
      const parsed = messagePerComponent.parseFileWithMessages(templateChanged);
      expect(parsed[0].msg).to.equal(msgWithNewLine);
    });
    it('should support multiple lines for the default message', () => {
      const messagePerComponent = getInstance();
      const template = messagePerComponent.getTemplate();
      const msgWithNewLine = 'default msg\nAnother line';
      const templateChanged = template.replace('DEFAULT:', `DEFAULT: ${msgWithNewLine}`);
      const parsed = messagePerComponent.parseFileWithMessages(templateChanged);
      expect(parsed[0].msg).to.equal(msgWithNewLine);
    });
  });
});
