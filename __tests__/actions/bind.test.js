import fs from 'fs-extra';
import R from 'ramda';
import BitJson from 'bit-scope-client/bit-json';
import bindAction from '../../src/actions/bind';

import {
  publicApiComponentLevel,
  componentsDependencies,
  publicApiForInlineComponents,
  publicApiForExportPendingComponents,
  dependenciesForInlineComponents,
  publicApiNamespaceLevel,
  publicApiRootLevel,
} from '../../src/links-generator';

import {
  build,
  buildForInline,
  buildForNamespaces,
} from '../../src/components-map';

import bitJsonOneDep from '../mocks/bit.1.json';

jest.mock('../../src/links-generator');
jest.mock('bit-scope-client/bit-json');
jest.mock('../../src/components-map');
jest.mock('fs-extra');

const VERSION_DELIMITER = '::';
const fromObjectToDependenciesArray = dependencies => R.toPairs(dependencies)
  .map(([component, version]) => component + VERSION_DELIMITER + version.toString());

beforeEach(() => {
  const dependenciesArray = fromObjectToDependenciesArray(bitJsonOneDep.dependencies);
  const loadedBitJson = {
    dependencies: bitJsonOneDep.dependencies,
    getDependenciesArray: dependenciesArray,
  };
  BitJson.load.mockReturnValue(loadedBitJson);
});

describe('bindAction', () => {
  it('should remove the moduleDir', () => {
    bindAction({});
    expect(fs.remove.mock.calls[0][0].includes('node_modules/bit')).toBeTruthy();
  });
  it('should call the ComponentMap.build function', () => {
    bindAction({});
    expect(build.mock.calls).not.toBeNull();
  });
  it('should call the ComponentMap.buildForInline function', () => {
    bindAction({});
    expect(buildForInline.mock.calls).not.toBeNull();
  });
  it('should call the ComponentMap.buildForNamespaces function', () => {
    bindAction({});
    expect(buildForNamespaces.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.publicApiComponentLevel function', () => {
    bindAction({});
    expect(publicApiComponentLevel.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.componentsDependencies function', () => {
    bindAction({});
    expect(componentsDependencies.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.publicApiForInlineComponents function', () => {
    bindAction({});
    expect(publicApiForInlineComponents.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.publicApiForExportPendingComponents function', () => {
    bindAction({});
    expect(publicApiForExportPendingComponents.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.dependenciesForInlineComponents function', () => {
    bindAction({});
    expect(dependenciesForInlineComponents.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.publicApiNamespaceLevel function', () => {
    bindAction({});
    expect(publicApiNamespaceLevel.mock.calls).not.toBeNull();
  });
  it('should call the LinksGenerator.publicApiRootLevel function', () => {
    bindAction({});
    expect(publicApiRootLevel.mock.calls).not.toBeNull();
  });
});
