import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout(): JSX.Element {
  return (
    <Tabs
      screenOptions={{
        headerTitle: 'QuoteSnap',
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
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
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
      <Tabs.Screen
        name="quotes"
        options={{
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
        name="draft/[id]"
        options={{ href: null, headerTitle: 'New Quote' }}
      />
      <Tabs.Screen
        name="quote/[id]"
        options={{ href: null, headerTitle: 'Quote Details' }}
      />
      <Tabs.Screen
        name="voice-record"
        options={{ href: null, headerTitle: 'Voice Quote', tabBarStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}
