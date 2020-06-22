import { BASE_WEB_DOMAIN } from '../../constants';

const allCommands = [
  {
    group: 'start',
    title: 'start a working area',
    commands: [
      {
        name: 'init',
        description: 'Create or reinitialize an empty Bit scope or reinitialize an existing one'
      }
    ]
  },
  {
    group: 'component',
    title: 'Develop components',
    commands: [
      {
        name: 'add',
        description: 'Add any subset of files to be tracked as a component(s).'
      },
      {
        name: 'status',
        description: 'Show the working area component(s) status.'
      },
      {
        name: 'tag',
        description: 'Record component changes and lock versions.'
      },
      {
        name: 'checkout',
        description: 'Switch between component versions.'
      },
      {
        name: 'merge',
        description: 'Merge changes of different component versions.'
      },
      {
        name: 'diff',
        description: 'Show diff between components files.'
      },
      {
        name: 'untag',
        description: 'Revert versions tagged for component(s).'
      },
      {
        name: 'move',
        description: 'Move a component to a different filesystem path.'
      },
      {
        name: 'untrack',
        description: 'Untrack a new component(s).'
      }
    ]
  },
  {
    group: 'collaborate',
    title: 'Collaborate on components',
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
        description: 'Install node packages of all components and calls the link command.'
      },
      {
        name: 'remote',
        description: 'Manage set of tracked bit scope(s).'
      },
      {
        name: 'remove',
        description: 'Remove component(s) from your working area, or a remote scope.'
      },
      {
        name: 'eject',
        description: 'Replaces the components from the local scope with the corresponding packages.'
      },
      {
        name: 'link',
        description: 'Generate symlinks for imported components absolute path resolution.'
      },
      {
        name: 'deprecate',
        description: 'Deprecate a component'
      },
      {
        name: 'undeprecate',
        description: 'Undeprecate a deprecated component'
      }
    ]
  },
  {
    group: 'discover',
    title: 'Explore components',
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
    group: 'info',
    title: 'View components',
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
    group: 'env',
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
      },
      {
        name: 'run',
        description: 'run an activity in the capsule'
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
    group: 'general',
    title: 'Workspace commands',
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
      },
      {
        name: 'scope-config',
        description: 'local scope config management'
      }
    ]
  }
];

export default allCommands;
