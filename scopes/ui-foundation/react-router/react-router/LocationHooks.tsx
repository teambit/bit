import { useEffect } from 'react';
import { useLocation, useNavigate, NavigateFunction, useNavigationType } from 'react-router-dom';
import { LocationListener } from './react-router.ui.runtime';

export function LocationHooks({
  onLocationChange,
  onNavigatorChange,
}: {
  onLocationChange: LocationListener;
  onNavigatorChange: (nav: NavigateFunction) => void;
}) {
  const location = useLocation();
  const navAction = useNavigationType(); // the action that got react router to this location
  const navigate = useNavigate();

  useEffect(() => {
    onLocationChange(location, navAction);
  }, [location, navAction, onLocationChange]);

  useEffect(() => {
    onNavigatorChange(navigate);
  }, [navigate, onNavigatorChange]);

  return null;
}
