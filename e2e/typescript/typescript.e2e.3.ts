import chai, { expect } from 'chai';
import * as path from 'path';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('typescript', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('react style => .tsx extension', () => {
    if (IS_WINDOWS) {
      // @ts-ignore
      this.skip;
    } else {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const listFixture = `import {Item} from '../item/item';
/**
 * Awesome List React component.
 */
export class List extends React.Component {
    public render() {
        return (
            <ul data-automation-id="LIST">
                <Item />
                <Item />
                <Item />
            </ul>
        );
    }
}
`;
        const itemFixture = '';
        helper.fs.createFile('list', 'list.tsx', listFixture);
        helper.fs.createFile('item', 'item.tsx', itemFixture);
        helper.command.addComponent('list/list.tsx', { i: 'list/list' });
        helper.command.addComponent('item/item.tsx', { i: 'item/item' });
      });
      it('should be able to parse .tsx syntax successfully and recognize the dependencies', () => {
        const output = helper.command.showComponent('list/list --json');
        const outputParsed = JSON.parse(output);
        expect(outputParsed.dependencies).to.have.lengthOf(1);
        expect(outputParsed.dependencies[0].id).to.equal('item/item');
      });
    }
  });
  describe('auto recognizing @types packages', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.npm.initNpm();
      helper.fs.outputFile(
        path.join('bar', 'index.ts'),
        `import { yo } from 'ninja';
        import { ya } from '@scoped/ninja';
        export {};`
      );

      helper.npm.addNpmPackage('ninja', '13.0.0');
      helper.npm.addNpmPackage('@types/ninja', '1.0.0');
      helper.npm.addNpmPackage('@scoped/ninja', '11.5.0');
      helper.npm.addNpmPackage('@types/scoped__ninja', '1.0.5');
      helper.packageJson.addKeyValue({ dependencies: { ninja: '13.0.0', '@scoped/ninja': '11.5.0' } });
      helper.packageJson.addKeyValue({ devDependencies: { '@types/ninja': '1.0.0', '@types/scoped__ninja': '1.0.5' } });

      helper.command.addComponent('bar', { i: 'bar/foo' });
    });
    it('should find the @types in the package.json file and automatically add it to the dependencies', () => {
      const show = helper.command.showComponentParsed();
      // regular @types/pkg
      expect(show.devPackageDependencies).to.include({ '@types/ninja': '1.0.0' });
      // scoped @types/xxx__pkg
      expect(show.devPackageDependencies).to.include({ '@types/scoped__ninja': '1.0.5' });
      // not expecting to include other packages:
      expect(show.devPackageDependencies).to.deep.equal({ '@types/ninja': '1.0.0', '@types/scoped__ninja': '1.0.5' });
    });

    describe('when the types package set to be ignored in the overrides', () => {
      before(() => {
        const overrides = {
          'bar/foo': {
            devDependencies: {
              '@types/ninja': '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('should not show the @types package anymore', () => {
        const show = helper.command.showComponentParsed();
        expect(show.devPackageDependencies).to.not.have.property('@types/ninja');
      });
    });
  });
});
