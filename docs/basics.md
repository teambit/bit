
# create-commit-export

```
TL.DR

bit create <component-id>
open ./inline_components/<component-id>/impl.js // write some code in impl.js
bit commit <component-id> 'initial commit'
bit export @this/<component-id> <remote-scope-name>
```

**Create a component, debug it, commit and than export it to a remote scope.**

## Create a component

Go to a project with bit scope in it (or create one by using `bit init` in a directory).

1\. Create a Bit component:

`bit create is-string`

This creates an implementation file in the [inline_components](GLOSSARY.md#inlinecomponents) directory.

2\. Write the component's implementation in the `impl.js` file created for the component.

    `open ./inline_components/global/is-string/impl.js`

You can copy and paste this example:

```js
  module.exports = function isString(val) {
    return typeof val === 'string';
  };
```

* You can see the status of all the components in your project using: `bit status`.

### Use it in your code

3\. Install the bit-js module using [NPM](https://www.npmjs.com/package/bit-js) or Yarn.

`npm install bit-js`

4\. Create a file - `touch index.js`, require bit-js module, and call the component:

```js
const bit = require('bit-js');
const isString = bit('is-string'); // <component-id>

console.log(isString('string')); // true
console.log(isString(1)); // false
```

5\. Now simply run the application `node index.js`.

bit-js will resolve the component from the inline_components directory.

* Read more about [Drivers](drivers.md).

### Commit your code

Our goal is to use a component in our future work. Before exporting it to a remote scope, it needs to committed from your inline_components to your local scope.

6\. `bit commit is-string 'initial commit'`

* Your component moved from the `inline_components` directory into the `components` directory. and you can still use it with `bit-js` same way as before.

* You can view the component you just added to your scope: `bit show @this/is-string`

* `@this` stands for local scope notation, you can also call the scope in it's real name located in `.bit/scope.json` file.

* Use `bit status` to get a clear view of all components in your local scope.

* `@this`, is the local scope annotation. That means when you want to refer to your local scope, you can use `@this` instead the real scope name (located in the scope.json file under the .bit directory)

### Export to a remote scope

Remote scopes allow you to use the components they contain in any repository or project. They also allow you to collaborate with others while using and managing your components together.

1. Export the component to the remote scope using `bit export @this/is-string @scopy`

* assuming that you created `@scopy` in the [initial setup chapter](initial-setup.md#create-remote-scope)

* Your component exported from the local scope, but it is still in the components directory, and available for requiring in the project. it also adds it to the bit.json file as a dependency.

* you can use `bit list @scopy` and `bit show @scopy/is-string` to verify that your component exported correctly.

# import-from-different-project

```
TL.DR

mkdir <different-project> && cd <different-project>
bit init
bit import <@remote-scope>/<component-id> --save
```

Open a new directory somewhere else.

`mkdir different-project && cd different-project`

Create a new scope

`bit init`

import the component and save it in bit.json file.

`bit import @scopy/is-string --save`

You can see that the component was exported to the project. (located in the components directory)

# modify-commit-export

```
TL.DR

bit modify <component-id>
bit commit <component-id>
bit export @this<component-id> <remote-scope>
```

First, a few notes about versioning - Bit doesn’t use semantic versioning. Instead, it supports only incremented component versioning. For example, the first version of a component will be 1, the second will be 2 and so forth.

### Let's say we want to add documentation to the component we just created.

1\. Import the component to the inline_bits folder:

`bit modify is-string`

The component is also in the staging area as you can see by typing `bit status`.
When you'll commit it, the version will increment itself.

2\. Make some changes. you can also copy and paste the following code.

<pre>
  <code class="js language-js">
  /**
  * determines whether `val` is a string.
  * @param {*} val reference to test.
  * @returns {boolean}
  * @example
  * ```js
  *  isString('') // => true
  *  isString(1) // => false
  * ```
  */
  module.exports = function isString(val) {
    return typeof val === 'string';
  };
  </code>
</pre>

3\. Commit the changes you have made to the component to your staging area.

`bit commit is-string "added documentation"`

4\. Now the component is ready to be updated in the remote scope. export it.

`bit export @this/is-string @scopy`

Your changes will be published to the remote scope as a new version for the same component.
Verify the version change with show command.

`bit show @scopy/is-string`

* you can read more about js-doc parsing [Here](advanced.md#js-docs-parsing)

# add-compiler

1\. Import the [Flow environment](https://bitsrc.io/bit/envs/compilers/flow) to your local scope, and set it as default to all newly created components:
  `bit import bit.envs/compilers/babel --compiler --save`

// TODO

# add-tester

```
TL.DR

bit import <tester-id> --tester --save
bit modify <remote-scope>/<component-id>
bit add-spec <component-id>
open inline_components/<box><component>/spec.js // add tests
bit test --component <component-id>
bit commit <component-id> "<commit-message>"
bit export @this/<component-id> <remote-scope>
```

1\. Import the [Mocha environment](https://bitsrc.io/bit/envs/testers/mocha) to your local scope, and set it as default to all newly created components:

`bit import bit.envs/testers/mocha --tester --save`

A tester enables you to test your components, read more about it [Here](GLOSSARY.md#tester)

2\. Modify `bit modify @scopy/is-string`.
3\. Add a spec.js file using `bit add-spec is-string` or you can just create spec.js file yourself yourself.
4\. Open the spec.js file: `open inline_components/global/is-string/spec.js`
5\. Paste this implementation or write tests of your own:

```js
const expect = require('chai').expect;
const isString = require(__impl__);

describe('#isString()', () => {
  it('should return true if `foo` is passed', () => {
    expect(isString('foo')).to.equal(true);
  });

  it('should return false if `1` is passed', () => {
    expect(isString(1)).to.equal(false);

  it('should return false if `[]` is passed', () => {
    expect(isString([1]])).to.equal(false);
  });
```

* note that the `__impl__` is a reference to the impl file injected by the testing environment.
* you can't use node modules like you would normal do, because the component should be exported to an isolated environment and run the specs there. you can only require the modules that the tester provides,

6\. Run the component's specs `bit test --inline is-string`.

7\. Commit the component `bit commit is-string "add unit tests"`.

8\. Export to a remote scope `bit export @this/is-string @scopy`.
