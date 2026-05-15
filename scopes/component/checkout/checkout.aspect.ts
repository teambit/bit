import { Aspect } from '@teambit/core';

export const CheckoutAspect = Aspect.create({
  id: 'teambit.component/checkout',
  runtimes: { main: () => import('./checkout.main.runtime') },
  commands: () => import('./checkout.commands').then((m) => [m.checkoutCommand, m.revertCommand]),
});
