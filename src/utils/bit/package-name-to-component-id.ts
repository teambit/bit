import R from 'ramda';

import { BitId } from '../../bit-id';
import { NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import { Consumer } from '../../consumer';
import GeneralError from '../../error/general-error';

/**
 * convert a component package-name to BitId.
 * e.g. `@bit/bit.utils.is-string` => { scope: bit.utils, name: is-string }
 *
 * it's not an easy task to determine what is the BitId based on the package-id, and here is why.
 * 1) since the introduction of "dynamic namespaces" feature, the name could have any number of
 * slashes. (can be "foo" or "bar/foo", both valid).
 * 2) a scope-name may or many not have a dot in the name. if it's self-hosted it can't have a dot.
 * if it's hosted on bit.dev it always has a dot.
 * 3) when there is no default-scope set in the workspace config, "bit link" generates paths that
 * don't have a scope-name. so, a package-name could be just a name with no scope.
 * 4) when there is default-scope set in the workspace config, "bit link" generates paths that have
 * scope-name although the same component on .bitmap don't have scope-name.
 *
 * As a result of the points above, a simple package-name: `@bit/foo.bar.qux` could be any of the
 * following three:
 * option 1) no-scope:    { scope: null,    name: foo/bar/qux }
 * option 2) self-hosted: { scope: foo,     name: bar/qux     }
 * option 3) bit.dev:     { scope: foo.bar, name: qux         }
 *
 * some constrains that help determine the BitId.
 * 1) if there is no dot, we know for sure that it can be only "name" and can't be with a
 * scope-name as the package-name always has the component-name.
 * (must be option #1)
 * 2) if there is one dot, it must be self-hosted. otherwise, the scope alone should have a dot,
 * leaving no room for the name.
 * (can't be option #3)
 * 3) if the component was not found on .bitmap, it can't be no-scope. because if this is a
 * no-scope case, it means that the component is new, as such, it must be on .bitmap.
 * (can't be option #1)
 *
 * searching .bitmap for each one of the possibilities is out best bet along with the constrains
 * above. if we can't find the component on .bitmap, we know that it can't be option #1, so it
 * can be option #2 or #3. we check the binding-prefix, it it's not @bit, it's probably self-hosted
 * so we go with option #2. otherwise, it's probably on bit.dev, so we go with option #3.
 *
 * one more thing. theoretically, there could be a conflict in the following case:
 * component 1: { scope: foo, name: bar }.
 * component 2: { scope: null, name: foo/bar }.
 * since it's valid to have these two components on the workspace, these two generate the same
 * package-name: `@bit/bar.foo`. as such, how do we know to determine the bitId from the
 * package-name? fortunately, when you have this component 1, you're unable to `bit add` this
 * component 2. when you specify bit add --id foo/bar, it actually adds the files to component 1,
 * assuming you used the entire name of the component 1 including the scope.
 */
export function packageNameToComponentId(consumer: Consumer, packageName: string, bindingPrefix: string): BitId {
  const componentName = getComponentName(packageName, bindingPrefix);

  const nameSplit = componentName.split(NODE_PATH_COMPONENT_SEPARATOR);
  const allBitIds = consumer.bitMap.getAllBitIdsFromAllLanes();

  const idWithoutScope = createBitIdAssumeNoScope(nameSplit);
  if (nameSplit.length < 2) {
    return _handleNoDotCase();
  }

  const idConsiderDefaultScope = _idConsiderDefaultScope();
  if (idConsiderDefaultScope) return idConsiderDefaultScope;

  const idWithScopeWithoutDot = createBitIdAssumeScopeDoesNotHaveDot(nameSplit);
  if (nameSplit.length === 2) {
    return _handleOneDotCase();
  }

  // package-name has two or more dots, it can be any of the above three options.
  return _handleTwoOrMoreDotsCase();

  function _handleNoDotCase(): BitId {
    // see constrain #1 above.
    if (allBitIds.searchWithoutVersion(idWithoutScope)) {
      return idWithoutScope;
    }
    throw new GeneralError(
      `packageNameToComponentId unable to determine the id of ${componentName}, it has no dot and is not exists on .bitmap`
    );
  }

  function _handleOneDotCase(): BitId {
    // see constrain #2 above.
    if (allBitIds.searchWithoutVersion(idWithoutScope)) {
      return idWithoutScope;
    }
    return idWithScopeWithoutDot;
  }

  function _handleTwoOrMoreDotsCase(): BitId {
    const idWithScopeWithDot = createBitIdAssumeScopeHasDot(nameSplit);
    if (allBitIds.searchWithoutVersion(idWithScopeWithDot)) return idWithScopeWithDot;
    if (allBitIds.searchWithoutVersion(idWithoutScope)) return idWithoutScope;
    if (allBitIds.searchWithoutVersion(idWithScopeWithoutDot)) return idWithScopeWithoutDot;

    // it's not on .bitmap, we can't determine whether it's option #2 or option #3.
    if (bindingPrefix !== 'bit' && bindingPrefix !== '@bit') {
      // only bit hub has the concept of having the username in the scope name.
      return idWithScopeWithoutDot;
    }
    // most users are not self-hosted, this is a safer bet
    return idWithScopeWithDot;
  }

  function _idConsiderDefaultScope(): BitId | undefined {
    const defaultScope = consumer.config.defaultScope;
    if (defaultScope && componentName.startsWith(`${defaultScope}.`)) {
      const idWithDefaultScope = createBitIdAssumeDefaultScope(defaultScope, nameSplit);
      const bitmapHasExact = allBitIds.hasWithoutVersion(idWithDefaultScope);
      if (bitmapHasExact) return idWithDefaultScope;
      const idWithRemovedScope = allBitIds.searchWithoutScopeAndVersion(idWithDefaultScope.changeScope(null));
      if (idWithRemovedScope) return idWithRemovedScope;
      // otherwise, the component is not in .bitmap, continue with other strategies.
    }
    return undefined;
  }
}

function getComponentName(packageName: string, bindingPrefix: string): string {
  // temp fix to support old components before the migration has been running
  const prefix = bindingPrefix === 'bit' ? '@bit/' : `${bindingPrefix}/`;
  return packageName.substr(packageName.indexOf(prefix) + prefix.length);
}

// happens before export when defaultScope is not set
function createBitIdAssumeNoScope(nameSplit: string[]): BitId {
  return new BitId({ name: nameSplit.join('/') });
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

function createBitIdAssumeDefaultScope(defaultScope: string, nameSplit: string[]): BitId {
  return defaultScope.includes('.')
    ? createBitIdAssumeScopeHasDot(nameSplit)
    : createBitIdAssumeScopeDoesNotHaveDot(nameSplit);
}
