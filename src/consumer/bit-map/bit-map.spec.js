import { expect } from 'chai';
import BitMap from './bit-map';

describe('Bit-map', () => {
  describe('resolveIgnoreFilesAndDirs', () => {
    it('should ignore whole folder if the config dir is not in component dir', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs('conf-dir', 'my-comp-dir', ['./.babelrc'], ['./mochaConf.js']);
      expect(res.dirs).to.contain('conf-dir');
    });
    it('should ignore nothing if there is no config dir', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs(null, 'my-comp-dir', ['./.babelrc'], ['./mochaConf.js']);
      expect(res.dirs).to.be.empty;
      expect(res.files).to.be.empty;
    });
    it('should ignore nested dir inside the component dir', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs(
        '{COMPONENT_DIR}/nested-dir/{ENV_TYPE}',
        'my-comp-dir',
        ['./compiler/.babelrc'],
        ['./tester/mochaConf.js']
      );
      expect(res.dirs).to.contain('my-comp-dir/nested-dir');
    });
    it('should ignore env types folders if {ENV_TYPE} exists', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs(
        '{COMPONENT_DIR}/{ENV_TYPE}',
        'my-comp-dir',
        ['./compiler/.babelrc'],
        ['./tester/mochaConf.js']
      );
      expect(res.dirs).to.contain('my-comp-dir/compiler');
      expect(res.dirs).to.contain('my-comp-dir/tester');
    });
    it('should ignore all compiler and tester files when {ENV_TYPE} exists', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs(
        '{COMPONENT_DIR}/{ENV_TYPE}',
        'my-comp-dir',
        ['./compiler/.babelrc'],
        ['./tester/mochaConf.js']
      );
      expect(res.files).to.contain('my-comp-dir/compiler/.babelrc');
      expect(res.files).to.contain('my-comp-dir/tester/mochaConf.js');
    });
    it('should ignore all compiler and tester files when {ENV_TYPE} not exists', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs(
        '{COMPONENT_DIR}',
        'my-comp-dir',
        ['./.babelrc'],
        ['./mochaConf.js']
      );
      expect(res.files).to.contain('my-comp-dir/.babelrc');
      expect(res.files).to.contain('my-comp-dir/mochaConf.js');
    });
  });
});
