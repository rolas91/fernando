import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/contexts/auth-context';
import { useNativeTheme } from '@/hooks/use-native-theme';

const TAB_ROUTE_NAMES = new Set(['index', 'calendar', 'timesheets', 'profile']);

function FilteredTabBar(props: BottomTabBarProps) {
  const { canRead } = useAuth();
  const routes = props.state.routes.filter((r) => {
    if (!TAB_ROUTE_NAMES.has(r.name)) return false;
    if (r.name === 'profile') return true;
    if (r.name === 'index')
      return canRead('work-orders') || canRead('mobile.assignments');
    if (r.name === 'calendar')
      return canRead('work-orders') || canRead('mobile.assignments');
    if (r.name === 'timesheets')
      return canRead('timesheets') || canRead('mobile.timesheets');
    return false;
  });
  const routeNames = routes.map((r) => r.name) as string[];
  const current = props.state.routes[props.state.index];
  let index = routes.findIndex((r) => r.key === current?.key);
  if (index < 0) index = 0;

  return (
    <BottomTabBar
      {...props}
      state={{
        ...props.state,
        routes,
        routeNames,
        index,
      }}
    />
  );
}

export default function TabLayout() {
  const { isDark, themeColor } = useNativeTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const activeTabColor = isDark ? '#f87171' : '#CC0000';
  const inactiveTabColor = isDark ? '#94a3b8' : '#7B8798';
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight = 66 + tabBarBottomPadding;

  const defaultTabBarStyle = {
    height: tabBarHeight,
    paddingTop: 4,
    paddingBottom: tabBarBottomPadding,
    backgroundColor: themeColor('#ffffff', 'background'),
    borderTopColor: themeColor('#e5eaf1', 'border'),
    borderTopWidth: 1,
    elevation: 0,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -1 },
  } as const;

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <FilteredTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: activeTabColor,
        tabBarInactiveTintColor: inactiveTabColor,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
          marginBottom: 4,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarStyle: defaultTabBarStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shifts',
          tabBarLabel: 'Shifts',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="timesheets"
        options={{
          title: 'Timesheets',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
