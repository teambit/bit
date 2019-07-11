import path from 'path';
import { expect } from 'chai';
import DependencyFileLinkGenerator from './dependency-file-link-generator';
import Component from '../consumer/component/consumer-component';
import barFoo from '../../fixtures/consumer-components/plain-javascript/bar-foo.json';
import utilsIsString from '../../fixtures/consumer-components/plain-javascript/utils-is-string.json';
import barFooEs6 from '../../fixtures/consumer-components/es6/bar-foo.json';
import utilsIsStringEs6 from '../../fixtures/consumer-components/es6/utils-is-string.json';
import barFooCustomResolved from '../../fixtures/consumer-components/custom-resolved-modules/bar-foo.json';
import utilsIsStringCustomResolved from '../../fixtures/consumer-components/custom-resolved-modules/utils-is-string.json';
import * as globalConfig from '../api/consumer/lib/global-config';

const mockBitMap = () => {
  return {
    getComponent: () => ({
      rootDir: '.dependencies/utils/is-string/remote-scope/0.0.1',
      getRootDir() {
        return this.rootDir;
      }
    })
  };
};

const mockConsumer = (distIsInsideTheComponent = true) => {
  const consumer = {
    bitMap: mockBitMap(),
    getPath: () => '/root',
    shouldDistsBeInsideTheComponent: () => true,
    toAbsolutePath: str => `/root/${str}`
  };
  if (!distIsInsideTheComponent) {
    consumer.config = { distEntry: 'src', distTarget: 'dist' };
    consumer.shouldDistsBeInsideTheComponent = () => false;
  }

  return consumer;
};

const mockGetSync = () => {
  globalConfig.getSync = () => '@bit';
};

describe('DependencyFileLinkGenerator', () => {
  before(() => {
    mockGetSync();
  });
  describe('generate()', async () => {
    describe('using plain javascript', () => {
      let dependencyFileLinkGenerator;
      let linkResult;
      before(async () => {
        const component = await Component.fromString(JSON.stringify(barFoo));
        component.componentMap = {
          rootDir: 'components/bar/foo',
          getRootDir() {
            return this.rootDir;
          }
        };
        const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsString));
        dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
          consumer: mockConsumer(),
          bitMap: mockBitMap(),
          component,
          relativePath: component.dependencies.get()[0].relativePaths[0],
          dependencyComponent,
          createNpmLinkFiles: false,
          targetDir: ''
        });
        const linkResults = dependencyFileLinkGenerator.generate();
        linkResult = linkResults[0];
      });
      it('should generate linkPath that consist of component rootDir + sourceRelativePath', () => {
        expect(linkResult.linkPath).to.equal(path.normalize('components/bar/foo/utils/is-string.js'));
      });
      it('should generate linkContent that points to the package', () => {
        expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
      });
      it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
        expect(linkResult.isEs6).to.be.false;
      });
    });
    describe('using ES6', () => {
      describe('when dist is inside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooEs6));
          component.componentMap = {
            rootDir: 'components/bar/foo',
            getRootDir() {
              return this.rootDir;
            }
          };
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringEs6));
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: mockConsumer(),
            bitMap: mockBitMap(),
            component,
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyComponent,
            createNpmLinkFiles: false,
            targetDir: ''
          });
          linkResults = dependencyFileLinkGenerator.generate();
        });
        it('should generate two link files, one for the source and one for the dist', () => {
          expect(linkResults).to.have.lengthOf(2);
        });
        describe('link file of the source', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[0];
          });
          it('should generate linkPath that consist of component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal(path.normalize('components/bar/foo/utils/is-string.js'));
          });
          it('should generate linkContent that points to the package', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should set isEs6 to true as it has ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('link file of the dist', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[1];
          });
          it('should generate linkPath that consist of component rootDir + dist + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal(path.normalize('components/bar/foo/dist/utils/is-string.js'));
          });
          it('should generate linkContent that points to the package', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should set isEs6 to true as it has ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
      });
      describe('when dist is outside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooEs6));
          component.componentMap = {
            rootDir: 'components/bar/foo',
            getRootDir() {
              return this.rootDir;
            }
          };
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringEs6));
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: mockConsumer(false),
            bitMap: mockBitMap(),
            component,
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyComponent,
            createNpmLinkFiles: false,
            targetDir: ''
          });
          linkResults = dependencyFileLinkGenerator.generate();
        });
        it('should generate two link files, one for the source and one for the dist', () => {
          expect(linkResults).to.have.lengthOf(2);
        });
        describe('link file of the source', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[0];
          });
          it('should generate linkPath that consist of component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal(path.normalize('components/bar/foo/utils/is-string.js'));
          });
          it('should generate linkContent that is relative to the linkPath', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should set isEs6 to true as it has ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('link file of the dist', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[1];
          });
          it('should generate linkPath that consist of dist + component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal(path.normalize('dist/components/bar/foo/utils/is-string.js'));
          });
          it('should generate linkContent that points to the package', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should set isEs6 to true as it has ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
      });
    });
    describe('using custom resolved modules with ES6', () => {
      describe('when dist is inside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        let linkResult;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooCustomResolved));
          component.componentMap = {
            rootDir: 'components/bar/foo',
            getRootDir() {
              return this.rootDir;
            }
          };
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringCustomResolved));
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: mockConsumer(),
            bitMap: mockBitMap(),
            component,
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyComponent,
            createNpmLinkFiles: false,
            targetDir: ''
          });
          linkResults = dependencyFileLinkGenerator.generate();
          linkResult = linkResults[0];
        });
        it('should generate one link file because it is stored in node_modules which is shared between the src and the dist', () => {
          expect(linkResults).to.have.lengthOf(1);
        });
        it('should generate linkPath that consist of component rootDir + node_modules + importSource (stored in relativePaths) + index.js', () => {
          expect(linkResult.linkPath).to.equal(
            path.normalize('components/bar/foo/node_modules/utils/is-string/index.js')
          );
        });
        it('should generate linkContent that points to the package', () => {
          expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
        });
        describe('when createNpmLinkFiles is set to true', () => {
          before(() => {
            dependencyFileLinkGenerator.createNpmLinkFiles = true;
            linkResults = dependencyFileLinkGenerator.generate();
            linkResult = linkResults[0];
          });
          it('should generate one link file because it is stored in node_modules which is shared between the src and the dist', () => {
            expect(linkResults).to.have.lengthOf(1);
          });
          it('should generate the link as postInstallLink (so then npm install will rewrite the links that are written in node_modules)', () => {
            expect(linkResult.postInstallLink).to.be.true;
          });
          it('should generate linkContent that points to the package name instead of a file', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should generate linkPath that consist of node_modules + importSource + index.js (it must be relative because it is written by postinstall script)', () => {
            expect(linkResult.linkPath).to.equal(path.normalize('node_modules/utils/is-string/index.js'));
          });
        });
      });
      describe('when dist is outside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooCustomResolved));
          component.componentMap = {
            rootDir: 'components/bar/foo',
            getRootDir() {
              return this.rootDir;
            }
          };
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringCustomResolved));
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: mockConsumer(false),
            bitMap: mockBitMap(),
            component,
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyComponent,
            createNpmLinkFiles: false,
            targetDir: ''
          });
          linkResults = dependencyFileLinkGenerator.generate();
        });
        it('should generate two link files, one for the source and one for the dist', () => {
          expect(linkResults).to.have.lengthOf(2);
        });
        describe('link file of the source', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[0];
          });
          it('should generate linkPath that consist of component rootDir + importSource + index.js', () => {
            expect(linkResult.linkPath).to.equal(
              path.normalize('components/bar/foo/node_modules/utils/is-string/index.js')
            );
          });
          it('should generate linkContent that points to the package', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
          it('should set isEs6 to true as it has ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('link file of the dist', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[1];
          });
          it('should generate linkPath that consist of dist + component rootDir + importSource + index.js', () => {
            expect(linkResult.linkPath).to.equal(
              path.normalize('dist/components/bar/foo/node_modules/utils/is-string/index.js')
            );
          });
          it('should generate linkContent that points to the package', () => {
            expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
          });
        });
      });
    });
  });
});
