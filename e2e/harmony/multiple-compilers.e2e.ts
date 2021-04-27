import fs from 'fs-extra';
import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('multiple compilers - babel and typescript', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('compile with babel and ts', () => {
    describe('compile simple ts component', () => {
      let distDir;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.addDefaultScope();
        helper.bitJsonc.disablePreview();

        // add a new env that compiles with Babel
        const envName = helper.env.setBabelWithTsHarmony();

        helper.fs.outputFile(
          'bar/foo.ts',
          // eslint-disable-next-line no-template-curly-in-string
          'export function sayHello(name: string) { console.log(`hello ${name}`); }; sayHello("David");'
        );
        helper.command.addComponent('bar');
        helper.extensions.addExtensionToVariant('bar', `my-scope/${envName}`);
        helper.command.compile();
        distDir = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
      });
      it('should generate dists on the workspace', () => {
        expect(distDir).to.be.a.directory();
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
      });
      it('should be able to run the dist file', () => {
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
        const result = helper.command.runCmd(`node ${path.join(distDir, 'foo.js')}`);
        expect(result).to.have.string('hello');
      });
      describe('compile on capsules', () => {
        let capsulePath;
        before(() => {
          helper.command.build();
          capsulePath = helper.command.getCapsuleOfComponent('bar');
        });
        it('should generate the dists on the capsule via babel compiler', () => {
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/foo.js')).to.be.a.file();
        });
        it('should generate the d.ts on the capsule via typescript compiler', () => {
          expect(path.join(capsulePath, 'dist/foo.d.ts')).to.be.a.file();
        });
      });
      describe('tagging the component', () => {
        let artifacts: any[];
        before(() => {
          helper.command.tagAllComponents();
          artifacts = helper.command.getArtifacts('bar');
        });
        it('should save the .js files under "dist" artifact', () => {
          const dist = artifacts.find((a) => a.name === 'dist');
          expect(dist).to.not.be.undefined;
          expect(dist.files).to.have.lengthOf(2);
          const files = dist.files.map((f) => f.relativePath);
          expect(files).to.deep.equal(['dist/foo.js', 'dist/foo.js.map']);
          expect(dist.generatedBy).to.equal('teambit.compilation/babel');
        });
        it('should save the .d.ts files under "declaration" artifact', () => {
          const declaration = artifacts.find((a) => a.name === 'declaration');
          expect(declaration).to.not.be.undefined;
          expect(declaration.files).to.have.lengthOf(1);
          expect(declaration.files[0].relativePath).to.equal('dist/foo.d.ts');
          expect(declaration.generatedBy).to.equal('teambit.typescript/typescript');
        });
      });
    });
  });
  // notice that comp1 and comp3 are multiple-compiler but comp2 and comp4 are react
  describe('different envs in the dependency graph', () => {
    let buildOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.disablePreview();
      helper.bitJsonc.addDefaultScope();
      helper.fixtures.populateComponentsTS(4);
      const babelEnv = helper.env.setBabelWithTsHarmony();
      helper.extensions.addExtensionToVariant('comp1', `my-scope/${babelEnv}`);
      helper.extensions.addExtensionToVariant('comp2', 'teambit.react/react');
      helper.extensions.addExtensionToVariant('comp3', `my-scope/${babelEnv}`);
      helper.extensions.addExtensionToVariant('comp4', 'teambit.react/react');
      helper.command.compile();
      buildOutput = helper.command.build();
    });
    it('should successfully build', () => {
      expect(buildOutput).to.have.string('the build has been completed');
    });
    it('should indicate that pre-build and post-build were running', () => {
      expect(buildOutput).to.have.string('executing pre-build for all tasks');
      expect(buildOutput).to.have.string('executing post-build for all tasks');
    });
    it('should write .npmignore with TS entries even when getCompiler() is Babel', () => {
      const comp1Capsule = helper.command.getCapsuleOfComponent('comp1');
      expect(path.join(comp1Capsule, '.npmignore')).to.be.a.file();
    });
    it('typescript should not override Babel dist files', () => {
      const comp1Capsule = helper.command.getCapsuleOfComponent('comp3');
      const distFile = path.join(comp1Capsule, 'dist/index.js');
      const distFileContent = fs.readFileSync(distFile).toString();
      expect(distFileContent).to.have.string('interopRequireDefault'); // this is generated only by Babel.
      expect(distFileContent).to.not.have.string('exports.default'); // this is generated only by Typescript.
    });
    it('Babel should not override typescript dist files', () => {
      const comp1Capsule = helper.command.getCapsuleOfComponent('comp2');
      const distFile = path.join(comp1Capsule, 'dist/index.js');
      const distFileContent = fs.readFileSync(distFile).toString();
      expect(distFileContent).to.have.string('exports.default'); // this is generated only by Typescript.
      expect(distFileContent).to.not.have.string('interopRequireDefault'); // this is generated only by Babel.
    });
  });
});
