import fs from 'fs-extra';
import chai, { expect } from 'chai';
import path from 'path';

import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('multiple compilers - babel and typescript', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('compile with babel and ts', () => {
    describe('compile simple ts component', () => {
      let distDir;
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();

        // add a new env that compiles with Babel
        const envName = helper.env.setBabelWithTsHarmony();

        helper.fs.outputFile(
          'bar/foo.ts',
          // eslint-disable-next-line no-template-curly-in-string
          'export function sayHello(name: string) { console.log(`hello ${name}`); }; sayHello("David");'
        );
        helper.command.addComponent('bar');
        helper.extensions.addExtensionToVariant('bar', `${helper.scopes.remote}/${envName}`);
        helper.command.compile();
        distDir = path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/bar/dist`);
      });
      // a "should generate dists on the workspace" test used to precede this one, asserting the dist
      // directory and foo.js exist. running foo.js below already proves both, so it is folded in.
      it('should generate dists on the workspace and be able to run the dist file', () => {
        expect(path.join(distDir, 'foo.js')).to.be.a.file();
        const result = helper.command.runCmd(`node ${path.join(distDir, 'foo.js')}`);
        expect(result).to.have.string('hello');
      });
      // a "compile on capsules" describe used to run `bit build` here only to assert that
      // dist/foo.js and dist/foo.d.ts exist on the capsule. the tagging describe below runs the
      // same build pipeline (tagAllComponents passes --build) and asserts on the saved artifacts,
      // which is strictly stronger: the same files, plus which compiler generated each one. the
      // standalone `bit build` entrypoint is still exercised by "different envs in the dependency graph".
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponentsTS(4);
      const babelEnv = helper.env.setBabelWithTsHarmony();
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/${babelEnv}`);
      helper.extensions.addExtensionToVariant('comp2', 'teambit.harmony/node');
      helper.extensions.addExtensionToVariant('comp3', `${helper.scopes.remote}/${babelEnv}`);
      helper.extensions.addExtensionToVariant('comp4', 'teambit.harmony/node');
      helper.command.compile();
      buildOutput = helper.command.build();
    });
    it('should successfully build', () => {
      expect(buildOutput).to.have.string('build succeeded');
    });
    it('should indicate that pre-build and post-build were running', () => {
      expect(buildOutput).to.have.string('running pre-build for all tasks');
      expect(buildOutput).to.have.string('running post-build for all tasks');
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
