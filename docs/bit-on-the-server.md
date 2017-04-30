# Bit on the Server

Bit is up and foremost a collaboration tool. To do so, you will need to set up a remote server to do any collaboration on [bit components](bit-component.md) (well, to be technically correct - you can import/export components directory from individual scopes, but it will not scale).

The best collaboration method is to set up a remote scope that all the consumers will have access to import and export component from. In this section, we'll refer to the 'remote scope' as 'bit server'. However, you will notice that the amount of resources used by a remote scope is so small, that you rarely need an entire server for it.

To set up a bit server you will need to decide on the type of protocol you need. Currently bit supports 2 protocols, which you will need to choose between them, according to your workflow. Then use this simple guide to run the commands required to create and connect the bit server.

Due to the fact that a bit server in used only as a collaboration tool, a bit server is basically a bare repository. Meaning a bit scope with no working directory.

## Protocols

Bit currently supports 2 types of communication protocol, for the scopes to communicate with each other. Local and SSH.

Each protocol has its own use cases, and here you'll learn when to use which. 

### Local Protocol

Bit's local protocol is based on accessing folders and files in your local file system. This means that a bit server which uses the local protocol will not be accessible for users that want to connect to the bit server from outside of the machine. So using this protocol is best for local work only, such as evaluating bit or developing it.

To use it, simply connect to the bit server by using this command:

```sh
bit remote add file://<path>/<to>/<remote>/<scope>
```

### SSH Protocol

A common transport protocol for Bit when self-hosting is over SSH. This is because SSH access to servers is already set up in most places – and if it isn’t, it’s easy to do. SSH is also an authenticated network protocol; and because it’s ubiquitous, it’s generally easy to set up and use.

This makes SSH to be the preferred way for collaboration when developing components to remote scopes.

To add a bit server over SSH, run this command:

```sh
bit remote add ssh://bit-server:/<path>/<to>/<remote>/<scope>
```

## Setting up a server

In this section we'll explain how to use a remote server to setup as many [scopes](bit-scope.md) as needed.

#### Prerequisites

1. *nix server.
2. User for `bit` (with `.ssh` and `authorized_keys`, for remote workflow).

### Create a remote scope

Once you have all prerequisites, the one thing left is to run the `bit init` command with the `--bare` flag, to create a scope without a working directory.

```sh
su bit
mkdir /opt/bit
cd /opt/bit
mkdir first-scope
cd first-scope
bit init --bare
```

Now add your own public SSH key to the `authorized_keys` list of the user `bit`. This will allow you to import and export components hosted in `first-scope`.

Let's add our `first-scope` as a remote scope to a newly create local scope on our development machine. I'll assume that our server is named `bit-server`, for the sake of this example.

```sh
mkdir my-project
bit init
bit remote add ssh://bit-server:/opt/bit/first-scope
bit create hello-world
bit commit hello-world 'testing remote'
bit export @this/hello-world first @first-scope
```

Notice that when working with scopes, you need to prepand the scope's name with @. Also not that when working with your local scope, you can use `@this` to tell bit you are doing actions on it, and not on remote scopes.

## Generating your SSH public key

These docs will describe the process of creating SSH key pair for Unix, seeing that it's a similar process across all operating systems.

1. Use this command to generate a new SSH key pair

  `ssh-keygen -t rsa -b 4096 -C "your_email@example.com"`

2. View the content of `~/.ssh` directory, and look for a pair of files named `id_rsa` and `id_rsa.pub`.

3. Copy the content of the `id_rsa.pub`, and add it to your server's `authorized_keys`.
