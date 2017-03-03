In this step-by-step guide you'll learn how to create, use and update your first reusable code component.

### Install Bit on your computer
Bit is an open source CLI tool designed to simplify the process of creating, managing and using reusable code component.
* [MacOS](install#macos)
* [Debian/Ubuntu](nstall#debianubuntu-linux)
* [RHEL/CentOS](install#centos--fedora--rhel)
* [Windows](install#windows)
* [Other](install#other)

### Your first local Bit scope
Scope’s responsibility is to store and manage the lifecycles of the reusable code components. You can create as many scopes as you need.
* Open a terminal application
* Create an empty directory `mkdir new-scope`
* Initialize an empty scope using the init command - `bit init`
This generates a bit.json file and a .bit directory, to manage all components you are using.

### Create a reusable code components
A code component must have an implementation file.

It can also have additional files for specifications and dependencies. This example does not include these features. See our more advanced tutorials.
* Create your ‘hello world’ component - `bit create hello-world`
    All components that are in development mode are listed in the ‘inline_directory’ folder.
* Open the implementation file using your favoured IDE - `open inline_components/global/hello-world/impl.js`
The ‘global’ directory is the ‘box’ (or - namespace) of the package. For now we will stick with the basics.
* Write this code in the impl.js file
```js
/**
 * Welcomes you to the world.
 * @example
 * ```js
 * helloWorld() // => 'hello world'
 * ```
 */
module.exports = function helloWorld() {
  console.log('hello world');
}
```
Congratulations! This is your first reuseable code component!

### Using a code component
Before we commit our component, let’s try to use it as a part of an application, to see if it works.
* To use Bit components in a nodeJS application, we need to install bit-js driver - `npm install bit-js`
* Now that the driver is installed, we need to create a JS file - `touch index.js`
* Open the file, and write this code
```js
bit = require('bit-js'); // use bit-js to "require" components that you have in your scope
bit('helloWorld')(); // run the component
```
* Run the code - `node index.js`
You should see an output saying ‘hello world’.

### Commit a component
Our ‘hello-world’ component is currently in development mode, and is still not a part of our project. To extract it we need to commit the changes we’ve made to the component to our local scope.
* `bit status`
* `bit commit hello-world ‘hi there’`
* `bit status`
You can try and run ‘node index.js’ to see that your code still works.

The component is commited, and ready to be exported to an external scope, so it can later be imported by other developers to other projects.

### Create an external scope
For this toturial we will use BitSrc to host a public scope, and export our ‘hello-world’ component.
First - you need to sign up to BitSrc - link
After signing up, click on the ‘create scope’ button. Select a name for the scope, add a description if you want, and make sure that the ‘public’ permission is set.
Bit uses SSH to comminicate with scopes, head over to [this tutorial](Manage-SSH-Keys) to learn how to create an upload SSH key to your BitSrc account.

### Export component to BitSrc
Now to the final part of the tutorial - run `bit export @this/hello-world <username>.<scopename>`

@this tells Bit that the component is in your local scope.

Now head back to your browser, and open the scope you just created - you’ll see your new component, click on it, to see it in the browser.

Horray! Your first reusable code component is now available to all developers to use in any project with a simple command!

### Modifying a component
OMG! Your ‘hello world’ does not end with a BANG!

This has to be refactored to include one. Hurry up and change it! 

The `modify` command takes a component, and puts it in your inline_components directory, so that you can modify it, and later export.
* `bit modify <username>.<scopename>/hello-world`
* `open inline_components/global/hello-world/impl.js`
* Add a ! to the console output
* Run `node index.js` to see the changes
* Commit the changes - `bit commit hello-world ‘end with bang’`
* View the log of the component to see you new commit - `bit log -i hello-world`
* Now export the component again - `bit export @this/hello-world <username>.<scopename>`
Head back to the browser, and see that the new implementation is there

### Further read-
* Zero to here - learn how to test components, and even use compilers
* [Wiki home page](wiki) - for more topics