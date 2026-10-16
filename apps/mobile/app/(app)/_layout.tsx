import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeaderActions } from '../../src/components/app/app-header-actions';
import { FeedbackProvider } from '../../src/components/feedback/feedback-provider';
import { tabBarHref } from '../../src/navigation/app-tabs';
import { SYNC_ISSUES_TITLE } from '../../src/sync/dead-letter';
import { colors, typography } from '../../src/theme/tokens';

/** Default tab is Quotes (A-12). Hidden index redirects to Quotes (A-19). */
export const unstable_settings = {
  initialRouteName: 'quotes',
};

export default function AppLayout(): JSX.Element {
  return (
    <FeedbackProvider>
    <Tabs
      screenOptions={{
        headerTitle: 'Vela',
        headerRight: () => <AppHeaderActions />,
        headerStyle: { backgroundColor: colors.dominant },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: {
          color: colors.text,
          fontSize: typography.body.fontSize,
          fontWeight: '700',
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.mutedText,
        sceneStyle: { backgroundColor: colors.dominant },
        tabBarStyle: {
          backgroundColor: colors.dominant,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: typography.label.fontSize,
          fontWeight: typography.label.fontWeight,
        },
      }}
    >
      <Tabs.Screen
        name="quotes"
        options={{
          href: tabBarHref('quotes'),
          title: 'Quotes',
          headerTitle: 'Quotes',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          href: tabBarHref('catalog'),
          title: 'My Catalog',
          headerTitle: 'My Catalog',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'list' : 'list-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="index" options={{ href: tabBarHref('index') }} />
      <Tabs.Screen
        name="draft/[id]"
        options={{ href: tabBarHref('draft/[id]'), headerTitle: 'New Quote' }}
      />
      <Tabs.Screen
        name="quote/[id]"
        options={{ href: tabBarHref('quote/[id]'), headerTitle: 'Quote Details' }}
      />
      <Tabs.Screen
        name="voice-record"
        options={{
          href: tabBarHref('voice-record'),
          headerTitle: 'Voice Quote',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="import-quotes"
        options={{
          href: tabBarHref('import-quotes'),
          headerTitle: 'Import old quotes',
        }}
      />
      <Tabs.Screen
        name="my-rates"
        options={{
          href: tabBarHref('my-rates'),
          headerTitle: 'My rates',
        }}
      />
      <Tabs.Screen
        name="sync-issues"
        options={{
          href: tabBarHref('sync-issues'),
          headerTitle: SYNC_ISSUES_TITLE,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          href: tabBarHref('stats'),
          headerTitle: 'Stats',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: tabBarHref('settings'),
          headerTitle: 'Settings',
        }}
      />
    </Tabs>
    </FeedbackProvider>
  );
}
