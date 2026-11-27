import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

function tabIcon(outline: IconName, filled: IconName) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Icon name={focused ? filled : outline} size={22} color={color} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const theme = useTheme();
  const { user } = useAuth();
  const unread = user?.unreadMessages ?? 0;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.text, fontWeight: '700' },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Jobs', tabBarIcon: tabIcon('jobs', 'jobsFill') }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: 'Saved', tabBarIcon: tabIcon('saved', 'savedFill') }}
      />
      <Tabs.Screen
        name="applications"
        options={{ title: 'Applications', tabBarIcon: tabIcon('applications', 'applicationsFill') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('profile', 'profileFill'),
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.brand },
        }}
      />
    </Tabs>
  );
}
