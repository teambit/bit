
# create-local-scope

Scope’s responsibility is to store and manage the components lifecycle. It's recommended to create the scope at the root of a project. You can create as many scopes as you need.

**type the following in the command line.**

* `mkdir hello-world` Create an empty directory.

* `bit init` Initialize an empty scope.

This generates a `bit.json` file and a `.bit` directory.

read more about the [local scope](GLOSSARY.md#local-scope)

# create remote scope

The most convenient way to set a remote scope would be to create a scope on [bitsrc.io](bitsrc.io) where you can also contribute and find communtiy components.

Alternatively, you can host a scope on any POSIX machine (you can host multiple scopes on the same machine/VM). All communication is done over SSH.

Follow these steps to host your own scope:

1. [Verify that bit is installed.](installation.md)

1. Create a directory on your machine. `mkdir scopy && cd scopy`

1. Initialize a bare Bit scope in the new folder. `bit init --bare`

That's it, the scope is ready, next we need to register it as a bit remote.

# setup remote scope

In your own development machine, use the `remote` command to add the new remote scope to your project.

`bit remote add file://</path/to/scope>`

* You can also add a scope from another machine via ssh.

`bit remote add ssh://</path/to/scope> --global`

* If you write the path without the third `/`, you'll start from the home directory.

`ssh://path/to/scope` === `~/path/to.scope`

`ssh:///path/to/scope>` === `/path/to.scope`

* If you don't use the `--global` flag, the remote is added to a specific project.

`bit remote add ssh://</path/to/scope>`
