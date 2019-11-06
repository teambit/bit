import { BASE_WEB_DOMAIN } from '../../constants';

const allCommands = [
  {
    title: 'start a working area',
    commands: [
      {
        name: 'init',
        description: 'create or reinitialize an empty Bit scope or reinitialize an existing one'
      }
    ]
  },
  {
    title: 'add, modify and control components',
    commands: [
      {
        name: 'add',
        description: 'add any subset of files to be tracked as a component(s).'
      },
      {
        name: 'status',
        description: 'show the working area component(s) status.'
      },
      {
        name: 'tag',
        description: 'record component changes and lock versions.'
      },
      {
        name: 'checkout',
        description: 'switch between component versions.'
      },
      {
        name: 'merge',
        description: 'merge changes of different component versions.'
      },
      {
        name: 'diff',
        description: 'show diff between components files.'
      },
      {
        name: 'untag',
        description: 'revert versions tagged for component(s).'
      },
      {
        name: 'move',
        description: 'move a component to a different filesystem path.'
      },
      {
        name: 'untrack',
        description: 'untrack a new component(s).'
      }
    ]
  },
  {
    title: 'collaborate and share components',
    commands: [
      {
        name: 'import',
        description: 'import components into your current working area.'
      },
      {
        name: 'export',
        description: 'export components to a remote scope.'
      },
      {
        name: 'install',
        description: 'install node packages of all components and calls the link command.'
      },
      {
        name: 'remote',
        description: 'manage set of tracked bit scope(s).'
      },
      {
        name: 'remove',
        description: 'remove component(s) from your working area, or a remote scope.'
      },
      {
        name: 'eject',
        description: 'replaces the components from the local scope with the corresponding packages.'
      },
      {
        name: 'link',
        description: 'generate symlinks for sourced components absolute path resolution.'
      },
      {
        name: 'deprecate',
        description: 'deprecate a component'
      },
      {
        name: 'undeprecate',
        description: 'undeprecate a deprecated component'
      }
    ]
  },
  {
    title: 'discover components',
    commands: [
      {
        name: 'list',
        description: 'list components on a local or a remote scope.'
      },
      {
        name: 'graph',
        description: 'EXPERIMENTAL. generate an image file with the dependencies graph.'
      }
    ]
  },
  {
    title: 'examine component history and state',
    commands: [
      {
        name: 'log',
        description: 'show components(s) version history.'
      },
      {
        name: 'show',
        description: 'show component overview.'
      }
    ]
  },
  {
    title: 'component environment operations',
    commands: [
      {
        name: 'build',
        description:
          'build any set of components with configured compiler (component compiler or as defined in bit.json)'
      },
      {
        name: 'test',
        description: 'test any set of components with configured tester (component tester or as defined in bit.json)'
      },
      {
        name: 'watch',
        description: 'watch components and perform `build` on changes'
      }
      // {
      //   name: 'eject-conf',
      //   description: 'ejecting components configuration'
      // },
      // {
      //   name: 'inject-conf',
      //   description: 'injecting components configuration'
      // }
    ]
  },
  {
    title: 'general commands',
    commands: [
      {
        name: 'login',
        description: `log the CLI into ${BASE_WEB_DOMAIN}`
      },
      {
        name: 'logout',
        description: `log the CLI out of ${BASE_WEB_DOMAIN}`
      },
      {
        name: 'config',
        description: 'global config management'
      },
      {
        name: 'doctor',
        description: 'diagnose a bit workspace'
      },
      {
        name: 'clear-cache',
        description: "clears Bit's cache from current working machine"
      }
    ]
  }
];

export default allCommands;
