import { generateExternals } from './generate-externals';

it('should return the correct value', () => {
  expect(generateExternals()).toBe('Hello world!');
});
