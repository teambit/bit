
Here we'll talk about some advanced matters in Bit.

### .gitignore

Add the following entries to your .gitignore

```
.bit
components
inline_components
```

## Building NPM modules

Some pointers to when you are building NPM modules that are using Bit components.

### .npmignore

When building NPM modules, add these entries to your .npmignore

```
.bit
inline-components
```

This will make sure that the consumer of your package will not need to install Bit-CLI in order to use your package.

### package.json

1. make sure that `bit-node` is a part of your package dependencies in your package.json file.

2. To import all Bit components when building your project, add one of the following commands to your project's `package.json` file: ([for additional info](https://docs.npmjs.com/misc/scripts))

```json
{ "postinstall":"bit import" }
{ "prepublish":"bit import" }
```

## Best practices for Bit components

### Naming
Component names should be clear.

A clear name provides more clarity as to what a component actually does.

Prefer short and descriptive names. If more namespacing and separation are needed, use scopes and boxes.

### Focused components

Writing small and focus components can be tricky.

To encourage this design principle, we built Bit to handle components as small and separated as possible. When exporting a component Bit only allows one file for implementation, a second file for testing and a third for metadata. This encourages you to strip away everything which isn’t relevant to the code functionality itself.

### Use dependencies

Prefer to use and extend over existing components instead of re-implementing them.

If your component is getting too big, check if you can split it to smaller components.

Prefer to use small dependencies (Bit components) over broad libraries.

### Documentation

Use language-specific code annotations for documentation (example - JSDocs for JavaScript). Provide good description and examples.

Documentation will help other developers understand how to use your component.

Bit’s internal search engine finds code components based on docs. Good docs will improve the discoverability of your components. By making components easy to find, your application will be less fragmented (tighter and better tested).

### API

Keep your APIs short, simple, and easy to remember.

### YAGNI

[YAGNI](https://en.wikipedia.org/wiki/You_aren't_gonna_need_it).

### Avoid globals

Globals, static fields, and singletons are dangerous. Avoid using them when designing your components.
Data types

It's best to assume generic types for vectors, quaternions, matrices, and so forth. It makes it easier to compose with other modules, so you can avoid "boxing and unboxing" objects across different components.

---

## Bit Design Philosophy

While writing code means we’re always designing new things, the majority of the building blocks we use were already written before.

When looking at the top 10k JavaScript repositories on GitHub, we learned that the simple functionality “is-string” was implemented in more than 100 different ways. The top 10 implementations were duplicated more than 1000 times. Really, this shouldn’t happen.

Time being wasted reinventing stuff is only part of the problem. As the world moves forward to microservice and multi-repository based architecture, code duplications and maintenance become an increasing problem. So does finding the code you actually need.
Micro-packages aren’t really a solution either. Packages are very demanding to publish. They are hard to find. They add code you don’t need to your application. They create external dependencies. They are very hard to find and discover.They just weren’t built to handle small components.
We had to find a way to write code components once - and use them anywhere across projects. We had to make them so easy and quick to create and use that it becomes a natural part of our workflow. We needed to make them super easy to maintain, and super easy to find. The components themselves had to be ready to use, ready to build and run anywhere.

So, we created Bit: a distributed code component manager.

Bit’s local workflow allows us to create and extract components in seconds. Bit’s isolated component environment means components can build and run anywhere. Its internal search engine makes our code easy to find. Bit also makes them super easy to maintain. Bit’s scoping mechanism mean we can collaborate and share components within our team.

Our philosophy is that any functionality can be composed out of smaller pieces. We began with this dream, and put it down to practice. We hope you’d like to share this journey. You will benefit from using Bir right away. Just imagine how we all will benefit 10 years from now.

---

## Dependencies

### How Bit calculate dependencies

---

## Versioning

Bit only supports incremental versioning. One might wonder if this is a lesser way of doing things. If using SemVer is better, because you get small fixes automatically. But, as we see in new packaging tools (OSTree, Snappy), the later approach is being increasingly unused. SemVer is based on a developer decision, and as such, is not bullet-proof.

Bit handles small code component with a single responsibility, not large packages. Such components simply tend to change less often. This made us favor strict versioning over SemVer and automatic updates. We value reliability and stability.

---

## Discovering code components


---

## Bit's Distributed Network

Bit handles code components.

To do it properly, we had to rethink the very way we distribute code.

### Bit network protocol

Bit uses SSH as a prefered protocol of choice to work with remote scopes.

SSH is a well-known and trusted protocol, giving Bit encryption, authentication and authorization out of the box when using SSH-keys.

When setting remote scopes over the network, with authentication, authorization and encryption, there's no new mechanism to learn, only the SSH basics.

### The case for distributed code component management

As developers, we prefer the distributed nature of Git and Mercurial, over centralized SCM tools like SVN. We believe that that's the right way to manage and handle code. When designing the tool we needed to manage code component, we naturally gravitated towards a distributed solution.

Unlike traditional package managers, which work in a centralized manner (client-server system approach), Bit takes a peer-to-peer approach to package management. Instead of a single, central repository on which clients synchronize, each client's working copy of the package is a complete one.

The advantages of distributed package management over centralized:

1. By default, each client has a working copy of the packages it uses, and not a canonical, reference copy.
2. Instead of simply keeping a reference to a remote package, each scope downloads the entire package and its dependencies.
3. The component is guaranteed to work on any remote scope, just like it worked on you local scope.
4. Each working copy functions as a remote backup of the packages it uses, protecting against data loss.
5. Each scope has all the requirements for a component to function, including a hard copy of all the dependencies. This makes Bit a bullet-proof storage solution.
6. Allowing offline work.
7. Once you have a working copy of a project, you also have a hard copy of all the components and dependencies. This means that you can work without any connection to a remote store.
8. You can also write your own components and even update components you are using, and push the changes next time you have network access.
9. Full local workflow (use draft locally without pushing them). Just as you can work offline, you can keep your local changes until you choose to publish them - and your project will still work exactly the same.
Interconnected scope network
10. In a large network of scopes, with many cross-dependencies, you constantly backup your work via clients that are connected to the scope.
11. Separate push operation for committing changes to remote scopes.
12. You can update current components in a complete working environment to test and iterate over them, making them isolated and ready to use outside of your project. When you’re all set and ready, push your changes to the remote scopes.
13. Most operations are fast (local).
    Most of the work is done on your local disk. Network access is only needed to either download more resources or push your changes.
14. Consistency.
    Distributed code component management is better suited to how we manage code. Centralized solutions for package management are still vital and work well to solve the specific problem of distributing large projects.

### Network of Bit scopes
Bit's distributed architecture adds a complexity when working with Bit on a large scale. All scopes needs to be interconnected to truly harness the collaborative nature of Bit.
Imagine creating a new component named Foo, which depends on Bar, which is located in a remote scope named Moon. Now, due to its nature, Foo needs to be pushed to another scope named Sun, and not to Moon.
So, in order for this scenario to work, both Moon and Sun needs to be connected. Together they form a sort of distributed network storage, so that Sun will be able to access Moon to grab Bar, which is Foo's dependency (more about this process).

This kind of configuration is important as it allows components to be flexible and dependent on components found outside their scope. This prevents the bad practice of putting components where they don't belong (imagine not having a utils class in your project's code).
Bit aims to make your code less tangled and more organized. It prefers refering between scopes over duplicating components or adding necessary items.
The process of referring between scopes works the same as referring your local project to a remote scope. To connect Sun to Moon you will need to head to each of the remote scopes, and add a remote to the other scope by:
bit remote add Sun # Or Moon, depends on the scope you are configuring.
You will need to ensure that both scopes have network connectivity between them, and that each scope has read permissions to the other scope.
