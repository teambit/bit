import { useNavigation } from './navigation-provider';
import { Navigator } from './link.type';

export function useNavigate(): Navigator {
  const nav = useNavigation();
  return nav.useNavigate?.() || nativeNavigator;
}

function nativeNavigator(target: string | number, { replace }: { replace?: boolean } = {}) {
  if (typeof window === 'undefined')
    throw new Error(
      'base-react.navigation.use-location - cannot use native navigator outside of browser. ' +
        'Inject a custom useNavigate, or use navigation after mount'
    );

  const { location, history } = window;

  if (typeof target === 'number') {
    history.go(target);
  } else if (replace) {
    location.replace(target);
  } else {
    location.assign(target);
  }
}
