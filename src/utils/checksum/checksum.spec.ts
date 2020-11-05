import { expect } from 'chai';
import path from 'path';
import { checksum, checksumFile } from './checksum';

describe('checksum()', () => {
  describe('string()', () => {
    it('should checksum a string', () => {
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(checksum('dshaw')).to.equal('9b8cebc0421241d087f6ab7e815285af803de7e7');
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(checksum('1234567890~!@#$%^&*()_+')).to.equal('d55303d0a19432c9689c9ebf51cee51f453b93bd');
    });
  });
  describe('checksumFile()', () => {
    it('should checksum a txt file', async () => {
      const result = await checksumFile(path.join(__dirname, './fixtures/dshaw.txt'));
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(result).to.equal('9b68ce43b8693db1f08f0c900d63ee4992cacfab');
    });
    it('should checksum a gif file', async () => {
      const result = await checksumFile(path.join(__dirname, './fixtures/1px.gif'));
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(result).to.equal('79fb6158b2e32b7c0b02cb6354c1cda56e91cc6f');
    });
  });
});
