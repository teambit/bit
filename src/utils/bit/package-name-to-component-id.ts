import R from 'ramda';
import { Consumer } from '../../consumer';
import { BitId } from '../../bit-id';
import { NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import GeneralError from '../../error/general-error';

/**
 * convert a component package-name to BitId.
 * e.g. `@bit/bit.utils/is-string` => { scope: bit.utils, name: is-string }
 */
// eslint-disable-next-line import/prefer-default-export
export function packageNameToComponentId(consumer: Consumer, packageName: string, bindingPrefix: string): BitId {
  // Temp fix to support old components before the migration has been running
  const prefix = bindingPrefix === 'bit' ? '@bit/' : `${bindingPrefix}/`;
  const componentName = packageName.substr(packageName.indexOf(prefix) + prefix.length);

  const nameSplit = componentName.split(NODE_PATH_COMPONENT_SEPARATOR);
  if (nameSplit.length < 2)
    throw new GeneralError(
      `package-name is an invalid BitId: ${componentName}, it is missing the scope-name, please set your workspace with a defaultScope`
    );
  // since the dynamic namespaces feature introduced, the require statement doesn't have a fixed
  // number of separators.
  // also, a scope name may or may not include a dot. depends whether it's on bitHub or self hosted.
  // we must check against BitMap to get the correct scope and name of the id.
  if (nameSplit.length === 2) {
    return new BitId({ scope: nameSplit[0], name: nameSplit[1] });
  }
  const defaultScope = consumer.config.defaultScope;
  const allBitIds = consumer.bitMap.getAllBitIds();

  if (defaultScope && componentName.startsWith(`${defaultScope}.`)) {
    const idWithDefaultScope = byDefaultScope(defaultScope, nameSplit);
    const bitmapHasExact = allBitIds.hasWithoutVersion(idWithDefaultScope);
    if (bitmapHasExact) return idWithDefaultScope;
    const idWithoutScope = allBitIds.searchWithoutScopeAndVersion(idWithDefaultScope.changeScope(null));
    if (idWithoutScope) return idWithoutScope;
    // otherwise, the component is not in .bitmap, continue with other strategies.
  }
  const mightBeId = createBitIdAssumeScopeDoesNotHaveDot(nameSplit);
  if (allBitIds.searchWithoutVersion(mightBeId)) return mightBeId;
  // only bit hub has the concept of having the username in the scope name.
  if (bindingPrefix !== 'bit' && bindingPrefix !== '@bit') return mightBeId;
  // pathSplit has 3 or more items. the first two are the scope, the rest is the name.
  // for example "user.scopeName.utils.is-string" => scope: user.scopeName, name: utils/is-string
  return createBitIdAssumeScopeHasDot(nameSplit);
}

// scopes on bit.dev always have dot in the name
function createBitIdAssumeScopeHasDot(nameSplit: string[]): BitId {
  const nameSplitClone = [...nameSplit];
  const scope = nameSplitClone.splice(0, 2).join('.');
  const name = nameSplitClone.join('/');
  return new BitId({ scope, name });
}

// local scopes (self-hosted) can not have any dot in the name
function createBitIdAssumeScopeDoesNotHaveDot(nameSplit: string[]): BitId {
  const scope = R.head(nameSplit);
  const name = R.tail(nameSplit).join('/');
  return new BitId({ scope, name });
}

function byDefaultScope(defaultScope: string, nameSplit: string[]): BitId {
  return defaultScope.includes('.')
    ? createBitIdAssumeScopeHasDot(nameSplit)
    : createBitIdAssumeScopeDoesNotHaveDot(nameSplit);
}
