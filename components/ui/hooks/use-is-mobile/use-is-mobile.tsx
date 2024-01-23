import { useUserAgent } from '@teambit/ui-foundation.ui.hooks.use-user-agent';

/**
 * react hook that returns the device type.
 */
export function useIsMobile() {
  const deviceType = useUserAgent()?.getDevice().type;
  return deviceType === 'tablet' || deviceType === 'mobile';
}
