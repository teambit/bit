import path from 'path';
import { checksum, checksumFile } from './checksum';

describe('checksum()', () => {
  describe('string()', () => {
    it('should checksum a string', () => {
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(checksum('dshaw')).toEqual('9b8cebc0421241d087f6ab7e815285af803de7e7');
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(checksum('1234567890~!@#$%^&*()_+')).toEqual('d55303d0a19432c9689c9ebf51cee51f453b93bd');
    });
  });
  describe('checksumFile()', () => {
    it('should checksum a txt file', async () => {
      const result = await checksumFile(path.join(__dirname, './fixtures/dshaw.txt'));
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(result).toEqual('9b8cebc0421241d087f6ab7e815285af803de7e7');
    });
    it('should checksum a gif file', async () => {
      const result = await checksumFile(path.join(__dirname, './fixtures/1px.gif'));
      // @ts-ignore
      // eslint-disable-next-line no-undef
      expect(result).toEqual('c65ed837d46f9122ab047c33d2f9e947786187b4');
    });
  });
});
