// TODO make this section address only the use of remote scope and not installation.
// installation should be only part of `Bit on the Server` section!

# Working with remotes

**Setup a remote scope**

You can host a scope on any POSIX machine (you can host multiple scopes on the same machine/VM). All remote communication is done over SSH.

Follow these steps to host your own scope:

1. [Verify that bit is installed.](installation.md)

1. Create a directory on your machine. `mkdir scopy && cd scopy`

1. Initialize a bare Bit scope in the new folder. `bit init --bare`

That's it, the scope is ready, next we need to register it as a remote scope.

**Add the new scope to your remotes list**

In your own development machine, use the `remote` command to add the new remote scope to your project.

`bit remote add file://</path/to/scope>`

* You can also add a scope from another machine via ssh.

`bit remote add ssh://</path/to/scope> --global`

* If you write the path without the third `/`, you'll start from the home directory.

`ssh://path/to/scope` === `~/path/to.scope`

`ssh:///path/to/scope>` === `/path/to.scope`

* If you don't use the `--global` flag, the remote is added to a specific project.

`bit remote add ssh://</path/to/scope>`
