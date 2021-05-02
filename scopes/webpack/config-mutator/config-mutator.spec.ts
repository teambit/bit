import { WebpackConfigMutator } from './config-mutator';

class MyPlugin {
  //@ts-ignore
  apply(compiler) {}
}

const cssRule = {
  test: /\.css$/,
  exclude: /\.module\.css$/,
  use: ['style-loader', 'css-loader'],
};

describe('add entry', () => {
  it('add simple entry', () => {
    const config = new WebpackConfigMutator({});
    config.addEntry('./entry1');
    expect(config.raw.entry).toContain('./entry1');
  });
  it('prepend entry', () => {
    const config = new WebpackConfigMutator({});
    config.addEntry('./entry1');
    config.addEntry('./entry2', { position: 'prepend' });
    expect(config.raw.entry).toContain('./entry1');
    expect(config.raw.entry).toContain('./entry2');
    expect(config.raw.entry?.[0]).toEqual('./entry2');
  });
});

describe('add plugin', () => {
  it('add simple plugin', () => {
    const config = new WebpackConfigMutator({});
    config.addPlugin(new MyPlugin());
    expect(config.raw.plugins?.[0]).toBeInstanceOf(MyPlugin);
  });
});

describe('add aliases', () => {
  it('add simple alias', () => {
    const config = new WebpackConfigMutator({});
    config.addAliases({ react: 'custom-react-path' });
    expect(config.raw.resolve?.alias).toHaveProperty('react', 'custom-react-path');
  });
});

describe('add top level', () => {
  it('add simple alias', () => {
    const config = new WebpackConfigMutator({});
    config.addTopLevel('output', { publicPath: 'my-public-path' });
    expect(config.raw).toHaveProperty('output');
    expect(config.raw.output).toHaveProperty('publicPath', 'my-public-path');
  });
});

describe('add module rule', () => {
  it('add css rule', () => {
    const config = new WebpackConfigMutator({});
    config.addModuleRule(cssRule);
    expect(config.raw.module?.rules?.length).toEqual(1);
    expect(config.raw.module?.rules?.[0]).toHaveProperty('test', /\.css$/);
    expect(config.raw.module?.rules?.[0]).toHaveProperty('exclude', /\.module\.css$/);
    expect(config.raw.module?.rules?.[0]).toHaveProperty('use', ['style-loader', 'css-loader']);
  });
});
