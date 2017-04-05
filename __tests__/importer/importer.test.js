const mockFs = require('mock-fs');
const { readIdsFromBitJson } = require('../../src/importer/importer');

const mockGoodConsumerPath = '/my/good/consumer';
const mockBadConsumerPath = '/my/bad/consumer';
const mockBitJson = `{
    "sources": {
        "impl": "impl.js",
        "spec": "spec.js"
    },
    "env": {
        "compiler": "bit.envs/compilers/flow::2",
        "tester": "bit.envs/testers/mocha::6"
    },
    "dependencies": {
        "bit.utils/global/is-string": "1",
        "bit.utils/string/to-base64": "1",
        "bit.utils/global/is-number": "1",
        "bit.utils/ssh/parse-url": "1",
        "bit.utils/string/remove-new-lines": "1",
        "bit.utils/string/from-base64": "1",
        "bit.utils/object/merge": "1",
        "bit.utils/object/merge-all": "1",
        "bit.utils/buffer/from": "15",
        "bit.utils/object/values": "1",
        "bit.utils/function/compose": "1",
        "bit.utils/object/evolve": "2",
        "bit.utils/object/group-by": "3",
        "bit.utils/object/map": "1",
        "bit.utils/array/flat-map": "1"
    }
}`;

const extractedIds = [
  'bit.utils/global/is-string::1',
  'bit.utils/string/to-base64::1',
  'bit.utils/global/is-number::1',
  'bit.utils/ssh/parse-url::1',
  'bit.utils/string/remove-new-lines::1',
  'bit.utils/string/from-base64::1',
  'bit.utils/object/merge::1',
  'bit.utils/object/merge-all::1',
  'bit.utils/buffer/from::15',
  'bit.utils/object/values::1',
  'bit.utils/function/compose::1',
  'bit.utils/object/evolve::2',
  'bit.utils/object/group-by::3',
  'bit.utils/object/map::1',
  'bit.utils/array/flat-map::1',
];

beforeEach(() => {
  mockFs({
    [mockGoodConsumerPath]: {
      'bit.json': mockBitJson,
    },
    [mockBadConsumerPath]: {
      'bit.json': {},
    },
  });
});

afterEach(() => {
  mockFs.restore();
});

describe('readIdsFromBitJson', () => {
  it('should read the ids if the bit.json exists', done =>
    readIdsFromBitJson(mockGoodConsumerPath)
    .then((ids) => {
      expect(ids).toEqual(extractedIds);
      done();
    }).catch(done.fail),
  );

  it('should reject with code INVALJSON if the bit.json is not there or not a valid one', done =>
    readIdsFromBitJson(mockBadConsumerPath)
    .catch((e) => {
      expect(e.code).toEqual('INVALJSON');
      done();
    }),
  );
});
