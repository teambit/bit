import { useNavigation } from './navigation-provider';
import { Location } from './link.type';

export function useLocation(): Location | undefined {
  const nav = useNavigation();
  const actualUseLocation = nav.useLocation || NativeUseLocation;

  return actualUseLocation();
}

function NativeUseLocation(): Location | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location;
}
