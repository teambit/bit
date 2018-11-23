function MyExtension(props, context) {
}

MyExtension.propTypes = {
  'myStringKey': 'string',
  'myBooleanKey': 'boolean',
  'myNumberKey': 'number',
  'myAnyKey': 'any',
  'myArrayKey': 'array<string>',
  'myFileKey': 'file',
  'myEmptyKey': 'string'
};

MyExtension.defaultProps = {
  'myStringKey': "my default string",
  'myBooleanKey': false,
  'myAnyKey': { strKey: 'hello', numKey: 1234 },
  'myNumberKey': 123,
  'myArrayKey': ['a', 'b'],
  'myFileKey': "./ext-file.js"
}

MyExtension.preStatusHook = () => console.log('Hello World');

exports.default = MyExtension;
