import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeaderRight } from '../../src/components/app/app-header-right';
import { tabBarHref } from '../../src/navigation/app-tabs';
import { SYNC_ISSUES_TITLE } from '../../src/sync/dead-letter';

/** Default tab is Quotes (A-12). Hidden index redirects to Quotes (A-19). */
export const unstable_settings = {
  initialRouteName: 'quotes',
};

export default function AppLayout(): JSX.Element {
  return (
    <Tabs
      screenOptions={{
        headerTitle: 'QuoteSnap',
        headerRight: () => <AppHeaderRight />,
        tabBarActiveTintColor: '#0066cc',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#cccccc',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '400',
        },
      }}
    >
      <Tabs.Screen
        name="quotes"
        options={{
          href: tabBarHref('quotes'),
          title: 'Quotes',
          headerTitle: 'Quote History',
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
        name="sync-issues"
        options={{
          href: tabBarHref('sync-issues'),
          headerTitle: SYNC_ISSUES_TITLE,
        }}
      />
    </Tabs>
  );
}
