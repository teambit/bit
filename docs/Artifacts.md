In this section we’ll define all the various entities in Bit’s eco-system and explain the relationships between them. If you have any questions, feel free to ask.

## Components

**Reusable code components**

Code components are the core entities managed by Bit. 

A code component is the smallest atomic functionality that handles a single responsibility.
Reusable code components should be focused, executable, encapsulated and testable pieces of code.

Bit was built to handle these components and make them reusable across repositories, microservices etc. 
It also allows to compose larger functionalities by using components as building blocks.

**How Bit handles components**

Bit manages the [component's complete lifecycle](Artifacts#scopes) from publishing to storing + CI and all the way to finding and reusing. 

The most basic way to handle code components with Bit is via the CLI util.
Basic commands can be used to create and export your component to the project's local scope (see below), import and modify it or export the component to a remote scope.

A component can consist of one file that includes the implementation of the functionality, but can also contain two additional (recommended) files:

1. spec - contains tests
2. bit.json - store dependencies, description, etc.

Bit was built to provide a fast and convenient workflow suited for code components.
The best way to learn more is to [create and export your first component](Getting-Started#typical-bit-workflows).

## Versioning components

**Incremental versioning**

Bit favors reliability and predictability. To support these principles, component versions are incremental. 

Whenever a component is being updated, Bit increments the version. Each version is handled as an independent component. When updating a component, you actually create a new one with the same ID and a new version number.

This simplified versioning makes maintenance easier and helps prevent breaking changes. 
You can find further elaboration in Bit’s design philosophy section. 

**Scopes manage versioning for you**

Today, most code goes through some CI and ‘build’ process. Bit was designed to do that for you. Components are stored, managed, built and tested all in your [Scope](Artifacts#scopes). 

As a result, components managed by Bit can build and run anywhere.

You can instruct Bit which tool to use in order to run the build and test processes. These parameters are defined in the bit.json file, so they are shipped with the component itself.

When you require to build or test a component, Bit will use these settings to download the requirements and compile or test your code.

You can find further elaboration in Bit’s [environments](Artifacts#environments) section. 

## Scopes

**What are scopes**

Scopes are one of the most important and valuable aspects of Bit.
The most basic role of scopes is to group and organize components together.

Each component belongs in a scope (or multiple scopes). therefore, the scope's name appears in the component's ID path (which consists of owner/scope/box/component).

However, scopes do much more than that.
Scopes are where components are stored, tested, built and integrate with each other.
We'll get to that later.

There are two kinds of scopes: Local and Remote.

**Local scopes**

Each project is fitted with a local scope to host the components being used in this project. Your local scope is your "staging area" where your reusable components can be easily extracted to from your project.

A local scope is automatically created for your project when you issue a [bit init command](getting-started).
Although the local scope does everything a remote scope does (store, verison managment, build, testing, dependency resoltuion and more- see below), it is best used as a staging area for components before being exported to your remote scopes.

**Remote scopes**

The best way to work with Bit and enjoy its full advantages is to work with a remote scope.
Components should be first committed to your local project's scope, then exported to a remote scope.

By doing so, you enable multiple team members to be connected to the same scopes making it easy to reuse components and collaborate. You can connect a remote scope to other remote scopes, creating an interconnected scopes network. 

There are three ways to set up a remote scope:

1. Use Bit's automatic resolver.
2. Use a `remote add` command to manually set up your own remote scope.
3. Write and config your own automatic resolver.

Using Bit's automated resolver saves you the trouble of setting up a remote scope on your machine.
It is configured to connect to a remote scope created for free on the free [bitsrc,io](https://bitsrc.io) platform where (almost) everything is being taken care of for you. You can learn more about easily [setting remote scopes with SSH communication](Getting-Started#setting-a-bit-scope).

Setting up your own remote scope on a local machine is also possible and you can [learn more here](Getting-Started#setting-a-bit-scope).

For help in creating your own automatic resolver feel free to contact us - we love to help.

**Scopes store, manage, test and build components**

Scopes takes care of components' entire lifecycle all the way from storing and version management, through build and test execution all the way to faster [dependency management and resolution] (Advanced#dependencies). 
Here are some of the things your scopes does for you:

* Store and version management.
* Test execution and build.
* Quick consumption and maintenance using the different bit commands (import, modify, etc.).
* On-export dependency management and resolution (faster and more predictable).
* Making components easy to find (semantic code search).
* Cross component compatibility.

You can learn more by [giving it a try](getting-started)

## Creating scopes

Whenever you run `bit init` you create a local scope.

All actions performed on components happen within scopes. Bit resolves and decides which scope is the current scope to run the command on by going up the directory tree to find the nearest scope. 

Note - you can import components without having a scope by using the flag `--no-scope`.

**Scopes network**

Scopes can be interconnected between themselves to form a network. 
By implementing a network, scopes can share components as dependencies.

You can read more about this topic at the [Network of Bit scopes](Advanced#bits-distributed-network) section.

## CI environments and scopes

Apart from storing components, scopes also manage the CI cycles for your components.

For each component, the scope manages also take care of building and testing this component.
To do so, you can define the required environment within the [component's definition file](Artifacts#components).

When you build or test a component you don't have the requirements needed for, Bit will download it for you. 
This way the scope ensures that every bit component can build and run everywhere.

Note - It is possible set your default build and test environments for your scope, so all created components will use them by default. This saves time and effort while creating a smoother workflow. This can be done in the scope's bit.json file.

## Bit Boxes (pun intended)

**What are boxes** 

Bit also want you to provide context for every component you create.
To provide components with context, Bit helps you sort them into boxes inside your scope.

Boxes are on a lower hierarchy level than scopes, but higher than the components themselves. A box is a prefix to the component's name, with ‘\’ used as a delimiter between the box and the component's IDs. 

It's not mandatory to set a box, but it will help to better organize components within your scopes, and make your code more readable and easier to find and use.

If you do not set a box, the component will automatically be stored in the ‘global’ box.

**Create box**

To create a box you need to create a component with a prefix of a box name, and Bit will automatically create the box for you withing the relevant scope.

Example: `bit create array\sort` # create the component 'sort' in the 'array' box.

To use components within boxes, you can append the box name to the component's ID when calling it. 

Example: bit.('array\sort');

## Inline_components

The inline_components folder acts as a development environment for code components. 

Creating or modifying a component can be done directly from your Inline folder, without having to create a new project or switching contexts. This is a key part in Bit's fast and smooth workflow for creating and maintaining components.

Components found in the inline_components folder are separated from your code, and are managed by Bit while not yet belonging to any scope (local or remote). 

Once you are done writing (or modifying) a component, you can commit the changes using the `bit commit` command. This command packages your component and runs the Bit CI cycle to test and build the component. The final result is extracted from your inline folder to the project’s local scope.

Once a component is in the local scope, you can `bit export` it to a remote scope, to be shared and reused in other projects, or by other team members.

Important notes:
* It is considered best practice try and keep the inline_components empty. You should only have components in there if you are currently working on them.
* This folder must be a part of your project, so it can't be in the .gitignore file (for example).

### Workflow around inline_components

#### Creating components

1. ‘Bit create’ - adds an empty component to inline_components.
2. Implement the functionality
    Use ‘bit build’ and ‘bit test’ as necessary
3. ‘Bit commit’ will commit the component to the local scope
4. ‘Bit push’ exports the component from the local scope to the remote one.

#### Modify component

1. ‘Bit import’ to download a component
2. ‘Bit modify’ takes the component out from the local scope to your development environment (inline_components)
3. ‘Bit commit’ will commit the changes you’ve made back to the local scope and increment its version.
4. ‘Bit push’ will push the new version back to the remote repository.
5. Use ‘bit status’ whenever needed to get exact data on the location and state of each component.

## Environments

Making sure code can run everywhere is hard. To ease this process, Bit implements 'environments'.

You can define your code's build and test requirements. Bit will then make sure all requirements are met when using a components. Taking the load of building a boilerplate to run code from you, to Bit.

### Build environments

Some programming languages need some sort of compiling done in order for them to run. If you use such language, Bit will make sure that the code you write will be able to build anywhere.

Define in bit.json the required build tool your code needs. Bit will use it to get all requirements so it can build it on any environment.

The build environment is a component with a set of requirements and an API for Bit to use.

When you run 'bit build', Bit will download the build component and it's dependencies. Bit will use it to build your code within the scope. The outcome of this action will be a `dist` file that can run without any boilerplating.

### Test environments 

There are many libraries designated to run test cases for code. Each developer chooses the one right for him.

Like build environments, Bit also support another type of environments for running tests.

When running 'bit test', Bit imports the configured test environments with it's dependencies. Using the imported environment, Bit runs the tests. Bit gets the output from the test results, and outputs it to you.

To run tests Bit uses a Bit component which provides an API to run the test suite with the specific test tool.

### Writing Your Own Environments

Bit does not contain  build or test libraries. So you need to extend it to support your specific programming language and tooling. What you need to do is to implement a component designed to build or test using a specific library. Use a scope to host it, so you can reuse it later as a dependency for other components.

**TODO list the APIs users need to implement**

You can search [bitsrc.io](https://bitsrc.io) for existing environments.