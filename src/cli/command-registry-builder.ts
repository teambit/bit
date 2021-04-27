import { BIT_DESCRIPTION, BIT_USAGE, BIT_VERSION } from '../constants';
import { Commands } from '../legacy-extensions/extension';
import CommandRegistry from './command-registry';
import Delete from './commands/private-cmds/_delete-cmd';
import DeprecatePrivate from './commands/private-cmds/_deprecate-cmd';
import _Fetch from './commands/private-cmds/_fetch-cmd';
import Action from './commands/private-cmds/_action-cmd';
import ScopeGraph from './commands/private-cmds/_graph-cmd';
import ScopeLanesList from './commands/private-cmds/_lanes-cmd';
import Latest from './commands/private-cmds/_latest-cmd';
import ScopeList from './commands/private-cmds/_list-cmd';
import ScopeLog from './commands/private-cmds/_log-cmd';
import Put from './commands/private-cmds/_put-cmd';
import DescribeScope from './commands/private-cmds/_scope-cmd';
import ScopeShow from './commands/private-cmds/_show-cmd';
import UndeprecatePrivate from './commands/private-cmds/_undeprecate-cmd';
import CatComponent from './commands/private-cmds/cat-component-cmd';
import CatLane from './commands/private-cmds/cat-lane-cmd';
import CatObject from './commands/private-cmds/cat-object-cmd';
import CatScope from './commands/private-cmds/cat-scope-cmd';
import CiUpdate from './commands/private-cmds/ci-update-cmd';
import DependencyStatus from './commands/private-cmds/dependency-status-cmd';
import Migrate from './commands/private-cmds/migrate-cmd';
import RefreshScope from './commands/private-cmds/refresh-scope-cmd';
import Add from './commands/public-cmds/add-cmd';
import Build from './commands/public-cmds/build-cmd';
import Checkout from './commands/public-cmds/checkout-cmd';
import ClearCache from './commands/public-cmds/clear-cache-cmd';
import Config from './commands/public-cmds/config-cmd';
import Deprecate from './commands/public-cmds/deprecate-cmd';
import Diff from './commands/public-cmds/diff-cmd';
import Doctor from './commands/public-cmds/doctor-cmd';
import Eject from './commands/public-cmds/eject-cmd';
import Fetch from './commands/public-cmds/fetch-cmd';
import Graph from './commands/public-cmds/graph-cmd';
import Import from './commands/public-cmds/import-cmd';
import Init from './commands/public-cmds/init-cmd';
import InjectConf from './commands/public-cmds/inject-conf-cmd';
import Isolate from './commands/public-cmds/isolate-cmd';
import Lane from './commands/public-cmds/lane-cmd';
import Link from './commands/public-cmds/link-cmd';
import Dependents from './commands/public-cmds/dependents-cmd';
import List from './commands/public-cmds/list-cmd';
import Log from './commands/public-cmds/log-cmd';
import Login from './commands/public-cmds/login-cmd';
import Logout from './commands/public-cmds/logout-cmd';
import Merge from './commands/public-cmds/merge-cmd';
import Move from './commands/public-cmds/move-cmd';
import Remote from './commands/public-cmds/remote-cmd';
import Remove from './commands/public-cmds/remove-cmd';
import ScopeConfig from './commands/public-cmds/scope-config-cmd';
import Show from './commands/public-cmds/show-cmd';
import Snap from './commands/public-cmds/snap-cmd';
import Status from './commands/public-cmds/status-cmd';
import Switch from './commands/public-cmds/switch-cmd';
import Tag from './commands/public-cmds/tag-cmd';
import Test from './commands/public-cmds/test-cmd';
import Undeprecate from './commands/public-cmds/undeprecate-cmd';
import Untag from './commands/public-cmds/untag-cmd';
import Untrack from './commands/public-cmds/untrack-cmd';
import Watch from './commands/public-cmds/watch-cmd';
import RunAction from './commands/private-cmds/run-action.cmd';
import Dependencies from './commands/public-cmds/dependencies-cmd';

export default function registerCommands(extensionsCommands: Array<Commands>): CommandRegistry {
  return new CommandRegistry(
    BIT_USAGE,
    BIT_DESCRIPTION,
    BIT_VERSION,
    [
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Init(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Isolate(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Snap(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Import(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Status(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new List(),
      new Config(),
      new ClearCache(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Remote(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new CatObject(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new CatComponent(),
      new CatLane(),
      new Dependents(),
      new Dependencies(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Show(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Log(),
      new ScopeLog(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Test(),
      new Put(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Watch(),
      new ScopeList(),
      new ScopeShow(),
      new ScopeGraph(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new _Fetch(),
      new Action(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Build(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new InjectConf(),
      new DescribeScope(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new CiUpdate(),
      new RefreshScope(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new CatScope(),
      new ScopeConfig(),
      // @ts-ignore
      new Link(),
      new DependencyStatus(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Add(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Untrack(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Untag(),
      new Tag(),
      new Move(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Remove(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Deprecate(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Undeprecate(),
      new Delete(),
      new DeprecatePrivate(),
      new UndeprecatePrivate(),
      new Latest(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Checkout(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Merge(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Diff(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Login(),
      new Logout(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Eject(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Migrate(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Doctor(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Graph(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Lane(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Switch(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new Fetch(),
      new RunAction(),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      new ScopeLanesList(),
    ],
    extensionsCommands
  );
}
