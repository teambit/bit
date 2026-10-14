import { CheckoutAspect } from './checkout.aspect';

export type { CheckoutMain, CheckoutProps } from './checkout.main.runtime';
export default CheckoutAspect;
export { CheckoutAspect };

export { applyVersion, removeFilesIfNeeded, updateFileStatus, throwForFailures } from './checkout-version';

// backward compatibility
// export {
//   applyModifiedVersion
// } from '@teambit/component.modules.merge-helper';

export type { ComponentStatus, ComponentStatusBase, ApplyVersionWithComps } from './checkout-version';
export { checkoutOutput } from './checkout-cmd';
