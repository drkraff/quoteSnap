import { Redirect } from 'expo-router';
import { AUTHENTICATED_ENTRY_HREF } from '../../src/navigation/authenticated-entry';

/**
 * Hidden from the tab bar (A-19). `/(app)` without a child still maps here;
 * bounce to Quotes so the Phase 1 Home stub is not a reachable screen.
 */
export default function AppIndexRedirect(): JSX.Element {
  return <Redirect href={AUTHENTICATED_ENTRY_HREF} />;
}
