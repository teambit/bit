import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { LocationListener } from './react-router.ui.runtime';

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
