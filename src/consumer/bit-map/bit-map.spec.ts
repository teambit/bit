import * as path from 'path';
import { expect } from 'chai';
import BitMap from './bit-map';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import ConfigDir from './config-dir';

const bitMapFixtureDir = path.join(__dirname, '../../../fixtures/bitmap-fixtures');

const addComponentParamsFixture = {
  componentId: new BitId({ name: 'is-string' }),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  origin: COMPONENT_ORIGINS.AUTHORED
};

const addComponentParamsImportedFixture = {
  componentId: new BitId({ scope: 'my-scope', name: 'is-string-imported', version: '0.0.1' }),
  files: [{ name: 'is-string-imported.js', relativePath: 'is-string-imported.js', test: false }],
  mainFile: 'is-string-imported.js',
  origin: COMPONENT_ORIGINS.IMPORTED,
  rootDir: 'utils'
};

describe('BitMap', function() {
  // @ts-ignore
  logger.debug = () => {};
  // @ts-ignore
  logger.info = () => {};
  this.timeout(0);
  describe('toObject', () => {
    let bitMap;
    let componentMap;
    before(() => {
      bitMap = BitMap.load(__dirname);
      bitMap.addComponent(addComponentParamsFixture);
      const allComponents = bitMap.toObjects();
      componentMap = allComponents['is-string'];
    });
    it('should remove the "id" property', () => {
      expect(componentMap).to.not.have.property('id');
    });
    it('should add "exported" property to authored components', () => {
      expect(componentMap).to.have.property('exported');
      expect(componentMap.exported).to.be.false;
    });
    it('should not add "exported" property to imported components', () => {
      bitMap.addComponent(addComponentParamsImportedFixture);
      const allComponents = bitMap.toObjects();
      const componentMapImported = allComponents['my-scope/is-string-imported@0.0.1'];
      expect(componentMapImported).to.not.have.property('exported');
    });
  });
  describe('getAuthoredExportedComponents', () => {
    it('should return an empty array when there are no authored components', () => {
      const bitMap = BitMap.load(path.join(bitMapFixtureDir, 'only-imported'));
      const results = bitMap.getAuthoredExportedComponents();
      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(0);
    });
  });
  describe('resolveIgnoreFilesAndDirs', () => {
    it('should ignore whole folder if the config dir is not in component dir', () => {
      const res = BitMap.resolveIgnoreFilesAndDirs('conf-dir', 'my-comp-dir', ['./.babelrc'], ['./mochaConf.js']);
      expect(res.dirs).to.contain('conf-dir');
    });
    it('should ignore nothing if there is no config dir', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  describe('parseConfigDir', () => {
    it('without any place holder', () => {
      const results = BitMap.parseConfigDir(new ConfigDir('config-dir'), 'root-dir');
      expect(results.compiler).to.equal('config-dir');
      expect(results.tester).to.equal('config-dir');
    });
    it('with {COMPONENT_DIR}', () => {
      const results = BitMap.parseConfigDir(new ConfigDir('{COMPONENT_DIR}'), 'root-dir');
      expect(results.compiler).to.equal('root-dir');
      expect(results.tester).to.equal('root-dir');
    });
    it('with {COMPONENT_DIR}/{ENV_TYPE}', () => {
      const results = BitMap.parseConfigDir(new ConfigDir('{COMPONENT_DIR}/{ENV_TYPE}'), 'root-dir');
      expect(results.compiler).to.equal('root-dir/compiler');
      expect(results.tester).to.equal('root-dir/tester');
    });
    it('with dir/{ENV_TYPE}', () => {
      const results = BitMap.parseConfigDir(new ConfigDir('dir/{ENV_TYPE}'), 'root-dir');
      expect(results.compiler).to.equal('dir/compiler');
      expect(results.tester).to.equal('dir/tester');
    });
  });
});
