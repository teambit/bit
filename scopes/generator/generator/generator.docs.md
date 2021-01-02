Create extension enable generating new components by a default template or extensions registered to this extension.

### Configuration
Add to your config the following:
```
"create": {
  "template": "your-extension"
}
```

### How to extend
First, add this extension as a dependency to your extension.
Then, in the provider, register to this extension and provide a function that returns the template files.
Here is an example:
```
create.register({ name: 'extensions/gulp-ts' }, (name) => {
  return {
    files: [
      { path: `${name}.js`, content: `export default function ${name}() { console.log('hello'); }` },
      { path: `${name}.spec.js`, content: `export default function ${name}() { console.log('hello from spec'); }` }
    ],
    main: `${name}.js`
  };
});
```
