import { StyleSheet, View } from 'react-native';
import { LogoutHeaderButton } from './logout-header-button';
import { SyncIssuesHeaderButton } from './sync-issues-header-button';

export function AppHeaderRight(): JSX.Element {
  return (
    <View style={styles.row}>
      <SyncIssuesHeaderButton />
      <LogoutHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
