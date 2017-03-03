This tutorial will take you through a full flow of working with Bit.

Bit allows you to extract components from your code and make them reusable, so it also needs a place to store and manage them. To do that, Bit uses a special distributed mechanism called **Scopes**. Scopes take care of storing, versioning, dependency management, build and test execution and more. Every project is fitted with a local scope which is created on your computer. You can also export your components to remote scopes. Remote scopes allow you to use your components across repositories and collaborate with others. Remote scopes can be set up on your [local machine](https://github.com/teambit/bit/wiki/Getting-Started#setting-a-bit-scope). You can learn more at the [getting started](https://github.com/teambit/bit/wiki/Getting-Started#setting-a-bit-scope) section. 

In this tutorial we'll be using the free [bitsrc.io](www.bitsrc.io) service, which is quicker to set up. This tutorial will take you through:

* Creating a reusable code component, written in [Flow](https://flowtype.org).
* Test component using [Mocha](https://mochajs.org) and [Chai](https://chaijs.com).
* Use the component in your code. 
* Export component to [bitsrc.io](https://bitsrc.io).
* Reuse your component in another project.

### Prerequisites
Bit needs to be able to extract components from your project and bring them all the way to being used across repositories or by other team members. To be able to do that it will need a few things:

1. [Install bit on your computer](install). 
2. Sign up to [bitsrc.io](https://bitsrc.io) - this is not necessary if you choose to [set up](https://github.com/teambit/bit/wiki/Getting-Started#setting-a-bit-scope) a remote scope on your machine. However, it is quicker.
3. [Create an upload SSH public key](manage-ssh-keys) to your BitSrc account. This is important for secure work with the bitsrc.io servers.


## Initialize a new Bit scope
All projects that use Bit can be fitted with a local scope. This scope will keep and manage the components you use in your project. 

To create a local scope:

1. Open a terminal application.
2. Create a directory for your project, and init a new scope for it (you can do the same for your other projects later on, we are now working on our new zero-to-hero project)
```sh
mkdir zero-to-hero
cd zero-to-hero
bit init
```
3. Optional: run `bit status` to see the state of the scope.

We now have a local scope ready to host and manage reusable code components for our project.

## Setting up your project default environments
A local scope takes care of your components build and test execution. In our project, we will work with Flow and test with Mocha. So, we want all our components to have these settings as default so that your scope will know how to run each component.

1. Import the [Flow environment](https://bitsrc.io/bit/envs/compilers/flow) to your local scope, and set it as default to all newly created components:
  `bit import bit.envs/compilers/flow --compiler --save`
2. Import the [Mocha environment](https://bitsrc.io/bit/envs/testers/mocha) to your local scope, and set it as default to all newly created components:
  ` bit import bit.envs/testers/mocha --tester --save`

You can read more about this feature in the [environments](Artifacts#environments) section.

## Create a reusable code component
For this example, let's create a Javascript code component that performs a very simple task: verifying if a variable is a string. This is a simple example, but you can do the same with every component designed to be reusable.

Create your first component:

1. Create a new component - `bit create --specs is-string`
2. This creates the directory structure for our new component in the [inline_directory]() folder.
3. Open the impl.js file that was created for the component: `open inline_components/global/is-string/impl.js`
4. Paste this implementation to the file:
```js
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
module.exports = function isString(val: string): boolean {
  return typeof val === 'string';
};
```
5. Open the spec.js: `open inline_components/global/is-string/spec.js`
6. Paste this implementation:
```js
import { expect } from 'chai';

const isString = require(__impl__);

describe('#isString()', () => {
  it('should return true if `foo` is passed', () => {
    expect(isString('foo')).to.equal(true);
  });
});
```

## Optional: build and test your component
Our component is now implemented. 
To make sure it's working, we can build it and run its tests.

1. Run `bit build is-string --inline` - to build the component.
2. `bit test is-string --inline` will test, and output the results.

If we've done everything right, we should see our component is working.
We can now use it in our repository or export it to a remote scope to be used in other repositories or by other team members.

## Using the component in your project
Now that you have `is-string` working, the next thing to do is use it in your code.

Although Bit is designed to be language agnostic, in its current version it requires language-specific drivers to work with different languages. For this tutorial you can install the Bit JS driver, require it in your code, and use the component.

1. Install bit-js - `npm install bit-js --save`
2. Create a file - `touch index.js`
3. Open the file, and add these lines:
```js
const bit = require('bit-js');
const isString = bit('is-string');
console.log(isString('hi there'));
```
4. Now simply run the application `node index.js` // true

## Commit your code
Our goal is to use a component in future work. Before exporting it to a remote scope, it needs to committed from your inline_components to your local scope.

1. `bit commit is-string 'initial commit'`
2. You can view the component you just added to your scope: `bit show @this/is-string`
3. Use `bit status` to get a clear view of all components in your local scope.

* `@this`, is the local scope annotation. That means when you want to refer to your local scope, you can use `@this` instead the real scope name (located in the scope.json file under the .bit directory)

## Export your component to a remote scope
Remote scopes are one of the most valuable features of using Bit.
Remote scopes allow you to use the components they contain in any repository or project. They also allow you to collaborate with others while using and managing your components together.
You can see an example of an open source utility scope in the [bitsrc.io here](https://bitsrc.io/bit/utils).
As mentioned earlier, you can set up a remote scope on your local machine- but for this toturial we will use the free bitsrc scope hosting service:

1. Head to [bitsrc.io](https://bitsrc.io) and sign up to create a new scope. We made it very simple.
2. Export the component to the remote scope using `bit export @this/is-string <username>.<scopename>`
3. Browse to the scope you added the component to, and see the component:
  * All docs from code are formatted and are presented on the component page.
  * Tests results summary is listed in a table below the docs.
  * Head over to the 'code' tab to view the component's code and tests.

## Modify
Code components are something we sometimes need to change or update. Bit does this by using a single command to import a remote component straight into your inline_components directory. let's add more tests to the component to make it more reliable.

To update the component or its test, we can modify the component and then export it again.

1. Move the component back to the `inline_components` directory:
  `bit modify <username>.<scopename>/is-string`
2. Optional: open the specs file and add these additional tests
```js
it('should return false if `1` is passed', () => {
  expect(isString(1)).to.equal(false);

it('should return false if `[]` is passed', () => {
  expect(isString([1]])).to.equal(false);
```
You can run all tests again, to validate that they pass - `bit test -i is-string`.
4. Commit our changes our local scope - `bit commit is-string 'add some more tests'`
5. Re-export the component - `bit export @this/is-string <username>.<scopename>`

*Notice that the version has been incrementaly updated automatically. It was made this way because it's simpler, and for better reliability and predictability. You can learn more about versioning in [versioning](Advanced#versioning).

Optional: open your browser, and view the component on bitsrc.io - 
you will see two more tests passed in the documentation section of your component.

## Use your component in other repositories

Remote scopes allow you to use the components they keep in any repository you choose.
To test it- you can set up a new project or use the component in an existing one.
Let's quickly set a new demo repository and use our components both our repositories:

1. Create a new project folder.
2. Initialize a new scope - `bit init`
3. Install the bit-js driver - `npm install bit-js -s`
4. Import and save the `is-string` component you just created - `bit import --save <username>.<scopename>/is-string`
5. Create a new file - `touch index.js`
6. Add the following code to the file
```js
const bit = require('bit-js');
const isString = bit('is-string');
console.log(isString('hi there'));
```
7. Run the application - `node index.js`

We are finished!
You now know how to work with Bit and make your components reusbale across projects.