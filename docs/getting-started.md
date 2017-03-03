The best way to start is to experience the most basic workflow of Bit.

This workflow includes 3 main steps:

1. Create your first component and commit it to your local scope.
2. Connect to a remote scope and export your component.
3. Modify and update your component with simple commands

Here are 3 main things you should know before you start:

* **Components** are the core entities managed by Bit. They contain a minimum of one file (implementation) and a maximum of three file (+ tests and definition). They are created or modified in your project's inline folder.
* **Scopes** are where your components are kept. They also build and run tests for your components. Scopes also take care of version management and dependency resolution. Local scopes are created per-project. REemote scopes allow you to collaborate with others and use components across repositories and projects.
* **Remote scopes** can be set by you on your local machine. You can also use the [bitsrc.io](https://www.bitsrc.io) hub and set up free secure remote scopes and consume components contributed by others. 

## Installation

Head over to the [installation](install) section

## Get started

### Creating your first component

Using Bit to create a local scope for your project.

1. Open a terminal app, browse to your project folder and type:
    
    `bit init`
    
    This generates Bit’s configuration file named bit.json and a .bit directory (which you should add to your .gitignore).

2. Create a Bit component:
    
    `bit create <component ID>`
    
    This creates an implementation file in the [inline_components](artifacts.md) folder.

3. Write the component's code in the `impl.js` file created for the component.

4. Get the status of all components in your project using:
    
    `bit status`

    You'll see all components you have in your project, with it's location and status.

5. Install the `bit-js` module using [NPM](npmjs.org) or [Yarn](http://yarnpkg.com).

6. Require Bit in your code, and call the component:
    
    ```js
    require('bit-js')

    bit(<component-ID>)
    ```
    
    This module is used to resolve the ID of the component, and call it from your code.

    Read more about Bit drivers [here](Bit-Drivers).

7. Commit the component to move it from `inline_components` to your [local scope](artifacts.md)
    
    `bit commit <component ID>`
    
    By doing so you commit the changes from your development environment to Bit's staging area.
    
    This action extracts the component out of your project, and making it isolated to be ready to distribute.

8. Issue another status command to view the changes:
    
    `bit status`

9. Connect the project's local scope to a [remote scope](artifacts.md)
    
    `bit remote add <remote name>`
    
    Remote scopes can be self hosted, or created in [bitsrc.io](https://bitsrc.io).

10. Now you can export the component to the remote scope.
    
    `bit export <component ID> <remote scope>`
    
    This publish your isolated component to the remote scope, making it usable by other team members across repositories.

### Editing and Updating Components

First, a few notes about versioning - Bit doesn’t use semantic versioning. Instead, it supports only incremented component versioning.
For example, the first version of a component will be 1, the second will be 2 and so forth.

Bit components are a part of your code and workflow, so you can edit your Bit components inline.

1. Move the component to the inline_bits folder:
        
    `bit modify <component ID>`
    
    This command moves the component from the isolated list of components to become an integral part of your project.
    Edit the component as much as you like.

2. Commit the changes you have made to the component to your staging area.
    
    `bit commit <component ID>`

3. Now the component is ready to be updated to the remote scope. To do so, run this command:
    
    `bit export <component ID> <remote scope>`
    
    Your changes will be published to the remote scope as a new version for the same component.

### Setting a Bit scope

The most convenient way to set a remote scope would be to create a free scope on [bitsrc.io](bitsrc.io) where you can also contribute and find communtiy components.

Alternatively, you can host a scope on any POSIX machine (you can host multiple scopes on the same machine/VM). All communication is done over SSH.

Follow these steps to host your own scope:

1. Install Bit on the machine. (see install instructions)

2. Create a directory on your machine.
    
    `mkdir scopy && cd scopy`

3. Initialize a bare Bit scope in the new folder.
    
    `bit init --bare`

4. In your own development machine, use the `remote` command to add the new remote scope to your project.
    
    `bit remote add ssh|file://<path to scope>`
