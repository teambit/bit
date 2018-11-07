import path from 'path';
import { expect } from 'chai';
import DependencyFileLinkGenerator from './dependency-file-link-generator';
import Component from '../consumer/component/consumer-component';
import barFoo from '../../fixtures/consumer-components/plain-javascript/bar-foo.json';
import utilsIsString from '../../fixtures/consumer-components/plain-javascript/utils-is-string.json';
import barFooEs6 from '../../fixtures/consumer-components/es6/bar-foo.json';
import utilsIsStringEs6 from '../../fixtures/consumer-components/es6/utils-is-string.json';

describe('DependencyFileLinkGenerator', () => {
  describe('generate()', async () => {
    describe('using plain javascript', () => {
      let dependencyFileLinkGenerator;
      let linkResult;
      before(async () => {
        const component = await Component.fromString(JSON.stringify(barFoo));
        const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsString));
        const bitMap = {
          getComponent: () => ({ rootDir: '.dependencies/utils/is-string/remote-scope/0.0.1' })
        };
        dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
          consumer: {
            bitMap,
            getPath: () => '/root',
            shouldDistsBeInsideTheComponent: () => true,
            toAbsolutePath: str => `/root/${str}`
          },
          component,
          componentMap: {
            rootDir: 'components/bar/foo'
          },
          relativePath: component.dependencies.get()[0].relativePaths[0],
          dependencyId: dependencyComponent.id,
          dependencyComponent,
          createNpmLinkFiles: false,
          targetDir: ''
        });
        const linkResults = dependencyFileLinkGenerator.generate();
        linkResult = linkResults[0];
      });
      it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
        expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
      });
      it('should generate linkContent that points to dependency rootDir + destinationRelativePath', () => {
        expect(linkResult.linkContent).to.have.string(
          '.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string'
        );
      });
      it('should generate linkContent that is relative to the linkPath', () => {
        const absoluteDest = '/root/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string';
        const relativeDest = path.relative(linkResult.linkPath, absoluteDest);
        expect(linkResult.linkContent).to.have.string(`require('${relativeDest}')`);
      });
      it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
        expect(linkResult.isEs6).to.be.false;
      });
      describe('when createNpmLinkFiles is set to true', () => {
        before(() => {
          dependencyFileLinkGenerator.isLinkToPackage = true;
          const linkResults = dependencyFileLinkGenerator.generate();
          linkResult = linkResults[0];
        });
        it('should generate linkContent that points to the package name instead of a file', () => {
          expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
        });
        it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
          expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
        });
        it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
          expect(linkResult.isEs6).to.be.false;
        });
      });
    });
    describe('using ES6', () => {
      describe('when dist is inside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooEs6));
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringEs6));
          const bitMap = {
            getComponent: () => ({ rootDir: '.dependencies/utils/is-string/remote-scope/0.0.1' })
          };
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: {
              bitMap,
              getPath: () => '/root',
              shouldDistsBeInsideTheComponent: () => true,
              toAbsolutePath: str => `/root/${str}`
            },
            component,
            componentMap: {
              rootDir: 'components/bar/foo'
            },
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyId: dependencyComponent.id,
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
          it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
          });
          it('should generate linkContent that points to dependency rootDir + destinationRelativePath', () => {
            expect(linkResult.linkContent).to.have.string(
              '.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string'
            );
          });
          it('should generate linkContent that is relative to the linkPath', () => {
            const absoluteDest = '/root/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string';
            const relativeDest = path.relative(linkResult.linkPath, absoluteDest);
            expect(linkResult.linkContent).to.have.string(`require('${relativeDest}')`);
          });
          it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('link file of the dist', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[1];
          });
          it('should generate linkPath that consist of consumerPath + component rootDir + dist + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal('/root/components/bar/foo/dist/utils/is-string.js');
          });
          it('should generate linkContent that points to dependency rootDir + dist + destinationRelativePath', () => {
            expect(linkResult.linkContent).to.have.string(
              '.dependencies/utils/is-string/remote-scope/0.0.1/dist/utils/is-string'
            );
          });
          it('should generate linkContent that is relative to the linkPath', () => {
            const absoluteDest =
              '/root/components/.dependencies/utils/is-string/remote-scope/0.0.1/dist/utils/is-string';
            const relativeDest = path.relative(linkResult.linkPath, absoluteDest);
            expect(linkResult.linkContent).to.have.string(`require('${relativeDest}')`);
          });
          it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('when createNpmLinkFiles is set to true', () => {
          before(() => {
            dependencyFileLinkGenerator.isLinkToPackage = true;
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
            it('should generate linkContent that points to the package name instead of a file', () => {
              expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
            });
            it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
              expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
            });
          });
          describe('link file of the dist', () => {
            let linkResult;
            before(() => {
              linkResult = linkResults[1];
            });
            it('should generate linkContent that points to the package name instead of a file', () => {
              expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
            });
            it('should generate linkPath that consist of consumerPath + component rootDir + dist + sourceRelativePath', () => {
              expect(linkResult.linkPath).to.equal('/root/components/bar/foo/dist/utils/is-string.js');
            });
          });
        });
      });
      describe('when dist is outside the component dir', () => {
        let dependencyFileLinkGenerator;
        let linkResults;
        before(async () => {
          const component = await Component.fromString(JSON.stringify(barFooEs6));
          const dependencyComponent = await Component.fromString(JSON.stringify(utilsIsStringEs6));
          const bitMap = {
            getComponent: () => ({ rootDir: '.dependencies/utils/is-string/remote-scope/0.0.1' })
          };
          dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
            consumer: {
              bitMap,
              bitJson: { distEntry: 'src', distTarget: 'dist' },
              getPath: () => '/root',
              shouldDistsBeInsideTheComponent: () => false,
              toAbsolutePath: str => `/root/${str}`
            },
            component,
            componentMap: {
              rootDir: 'components/bar/foo'
            },
            relativePath: component.dependencies.get()[0].relativePaths[0],
            dependencyId: dependencyComponent.id,
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
          it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
          });
          it('should generate linkContent that points to dependency rootDir + destinationRelativePath', () => {
            expect(linkResult.linkContent).to.have.string(
              '.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string'
            );
          });
          it('should generate linkContent that is relative to the linkPath', () => {
            const absoluteDest = '/root/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string';
            const relativeDest = path.relative(linkResult.linkPath, absoluteDest);
            expect(linkResult.linkContent).to.have.string(`require('${relativeDest}')`);
          });
          it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('link file of the dist', () => {
          let linkResult;
          before(() => {
            linkResult = linkResults[1];
          });
          it('should generate linkPath that consist of consumerPath + dist + component rootDir + sourceRelativePath', () => {
            expect(linkResult.linkPath).to.equal('/root/dist/components/bar/foo/utils/is-string.js');
          });
          it('should generate linkContent that points to dependency rootDir + destinationRelativePath (the dist should not be there as it is already inside /root/dist)', () => {
            expect(linkResult.linkContent).to.have.string(
              '.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string'
            );
          });
          it('should generate linkContent that is relative to the linkPath', () => {
            const absoluteDest =
              '/root/dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string';
            const relativeDest = path.relative(linkResult.linkPath, absoluteDest);
            expect(linkResult.linkContent).to.have.string(`require('${relativeDest}')`);
          });
          it('should set isEs6 to false as it does not have ImportSpecifiers', () => {
            expect(linkResult.isEs6).to.be.true;
          });
        });
        describe('when createNpmLinkFiles is set to true', () => {
          before(() => {
            dependencyFileLinkGenerator.isLinkToPackage = true;
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
            it('should generate linkContent that points to the package name instead of a file', () => {
              expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
            });
            it('should generate linkPath that consist of consumerPath + component rootDir + sourceRelativePath', () => {
              expect(linkResult.linkPath).to.equal('/root/components/bar/foo/utils/is-string.js');
            });
          });
          describe('link file of the dist', () => {
            let linkResult;
            before(() => {
              linkResult = linkResults[1];
            });
            it('should generate linkContent that points to the package name instead of a file', () => {
              expect(linkResult.linkContent).to.equal("module.exports = require('@bit/remote-scope.utils.is-string');");
            });
            it('should generate linkPath that consist of consumerPath + dist + component rootDir + sourceRelativePath', () => {
              expect(linkResult.linkPath).to.equal('/root/dist/components/bar/foo/utils/is-string.js');
            });
          });
        });
      });
    });
  });
});
