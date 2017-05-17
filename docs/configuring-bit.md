
# Configuring Bit

## General configuration

The general (global) configuration is configured through the `bit config` command.

You can learn more by typing `bit config --help` in the terminal.


|         key          |Required|   Type    |                            Details                             |
| -------------------- |:------:|:---------:| ---------------------------------------------------------------|
|     ssh_key_file     | F      |   String  | A path to an ssh key file, defaults to "~/.ssh/id_rsa"         |
|     user.email       | T      |   String  | The Email of the user, will be saved on the commit logs        |
|     user.name        | T      |   String  | The name of the user, will be saved on the commit logs         |
|     hub_domain       | F      |   String  | The domain of the default hub, defaults to "hub.bitsrc.io"     |

### Your Identity

The first thing you should do when you install Bit is to set your user name and e-mail address. This is important because every component's commit uses this information, and it’s immutable after you perform a commit:

`bit config set user.name "mickey mouse"`

`bit config set user.email mickey@example.com`

## bit.json

|         Name         |Required|   Type    |                            Details                             |
| -------------------- |:------:|:---------:| ---------------------------------------------------------------|
|     dependencies     | F      |   Object  | The other components that the component is dependent on        |
| packageDependencies  | F      |   Object  | The npm packages that the component is dependent on            |
|     env              | F      |   Object  | An object describing the component environments                |
|     env.compiler     | F      |   String  | The component id of the compiler                               |
|     env.tester       | F      |   String  | The component id of the compiler                               |
|     sources          | F      |   Object  | An object describing the component sources                     |
|     sources.impl     | F      |   String  | The component implementation file name                         |
|     sources.spec     | F      |   String  | The component spec file name                                   |
|     language         | F      |   String  | The component's programming language                           |

**Example**

```json
{
    "sources": {
        "impl": "impl.js",
        "spec": "spec.js"
    },
    "env": {
        "compiler": "bit.envs/compilers/flow::latest",
        "tester": "bit.envs/testers/mocha-chai::latest"
    },
    "dependencies": {
        "bit.utils/is-string": "latest"
    },
    "packageDependencies": {
        "camelcase": "4.0.0"
    },
    "language": "javascript"
}
```

## scope.json

|         Name         |Required|   Type    |                            Details                             |
| -------------------- |:------:|:---------:| ---------------------------------------------------------------|
| name                 | T      |   String  | The scope name                                                 |
| remotes              | F      |   Object  | scopes remotes                                                 |

**Example**

```json
{
    "name": "scopy",
    "remotes": {}
}
```

# Folders

  Folder structure used by Bit.

Bit stores information in several folders and files on your machine. This section describes the
various locations on these items, and their responsibilities.

## Cache

### Location

Depending on your OS, Bit stores it's cache folder in the following locations:

* MacOS - /Library/Caches/Bit
* Windows - %LOCAL-APP-DATA%\Bit
* Linux - ~/.bit

### Structure

* modules - Cache for various node modules used by Bit.
* config - stores Bit specific configurations.
  * config.json - stores all the configurations required for Bit to operate (location of SSH keys,
    username, email...)
  * global-remotes.json - Manages the list of the remote scopes connected to the machine.
