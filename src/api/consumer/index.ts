import getConsumerComponent from './lib/get-consumer-component';
import getScopeComponent from './lib/get-scope-component';
import { listScope } from './lib/list-scope';
import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';
import show from './lib/show';
import { clearCache } from './lib/clear-cache';

export { listScope, getConsumerComponent, getScopeComponent, remoteAdd, remoteList, remoteRm, show, clearCache };
