# Bit driver for nodejs

For more information on Bit drivers, head over this Bit's wiki page [about this
topic](https://github.com/teambit/bit/wiki/Bit-Drivers).

### Installing Bit-node.

```sh
npm install bit-node -s
```

### Requiring components

First, you need to require the bit-node module:

```js
const bit = require('bit-node');
```

After requiring the module, you can use any component from your bit.json file.

```js
isString = bit.('isString');
```

Calling component is simple :)

```js
console.log(isString('Hello World!');
```

## Contributing to Bit-node

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
