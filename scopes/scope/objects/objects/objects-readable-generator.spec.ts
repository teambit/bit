import { expect } from 'chai';
import { ObjectsReadableGenerator } from './objects-readable-generator';
import Ref from './ref';

describe('ObjectsReadableGenerator', () => {
  it('should stream an object once, also when it is requested more than once', async () => {
    const generator = new ObjectsReadableGenerator({} as any, () => {});
    const refs = ['a', 'b', 'a', 'c', 'b'].map((char) => new Ref(char.repeat(40)));
    const scope = { getObjectItem: async (ref: Ref) => ({ ref, buffer: Buffer.from(ref.hash) }) };
    const streamed: string[] = [];
    const ended = new Promise((resolve) => generator.readable.on('end', resolve));
    generator.readable.on('data', (item) => streamed.push(item.ref.toString()));
    await generator.pushObjects(refs, scope as any);
    await ended;
    expect(streamed).to.deep.equal(['a', 'b', 'c'].map((char) => char.repeat(40)));
  });
});
