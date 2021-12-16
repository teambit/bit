import { generateExposeLoaders } from './generate-expose-loaders';

it('should return the correct value', () => {
  expect(generateExposeLoaders()).toBe('Hello world!');
});
