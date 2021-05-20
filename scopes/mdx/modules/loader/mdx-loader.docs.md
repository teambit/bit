---
description: A Webpack Loader that compiles Bit flavored MDX
labels: ['TypeScript', 'Webpack-loader', 'mdx']
---

Bit-MDX Webpack Loader enables a compilation of Bit flavoured MDX. The Bit Flavoured MDX is an MDX that is themed using Bit's [Documenter](https://bit.dev/teambit/documenter) design system, and extended with Bit's [frontmatter properties]().
The Bit-MDX Loader can be used in any Webpack configuration.

For example:

```js
{
    test: /\.mdx?$/,
    exclude: [/node_modules/, /dist/],
    use: [
        {
            loader: require.resolve('babel-loader'),
            options: {
                babelrc: false,
                configFile: false,
                presets: [require.resolve('@babel/preset-react'), require.resolve('@babel/preset-env')],
                plugins: [require.resolve('react-refresh/babel')],
            },
        },
        {
            loader: require.resolve('@teambit/mdx.modules.mdx-loader'),
        },
    ],
}
```
