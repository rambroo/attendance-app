import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ActivityIndicator, StyleSheet,
  Text, TouchableOpacity, Alert,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LeavesScreen from './src/screens/LeavesScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import ShiftsScreen from './src/screens/ShiftsScreen';
import KioskScreen from './src/screens/KioskScreen';
import SiteSetupScreen from './src/screens/SiteSetupScreen';
import { isAuthenticated, logout, silentReLogin } from './src/api/authApi';
import { isSiteConfigured, isKioskMode, clearSiteConfig } from './src/utils/siteConfig';
import { C } from './src/utils/theme';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home:    '⏱',
  History: '📋',
  Leaves:  '🌿',
  Salary:  '💰',
  Shifts:  '📅',
};

// Bottom tab bar — adds extra bottom padding so it never overlaps an
// Android 3-button nav bar (or iPhone home indicator). Must live inside
// SafeAreaProvider to read insets.
function MainTabs({ loginKey, handleLogout, handleSessionExpired }) {
  const insets = useSafeAreaInsets();
  const navBarPad = Math.max(insets.bottom, 6);

  return (
    <Tab.Navigator
      key={loginKey}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 54 + navBarPad, paddingBottom: navBarPad }],
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home" options={{ tabBarLabel: 'Punch' }}>
        {() => <HomeScreen onLogout={handleLogout} onSessionExpired={handleSessionExpired} />}
      </Tab.Screen>
      <Tab.Screen name="History" options={{ tabBarLabel: 'Attendance' }}>
        {() => <HistoryScreen onLogout={handleLogout} onSessionExpired={handleSessionExpired} />}
      </Tab.Screen>
      <Tab.Screen name="Leaves" options={{ tabBarLabel: 'Leaves' }}>
        {() => <LeavesScreen onLogout={handleLogout} onSessionExpired={handleSessionExpired} />}
      </Tab.Screen>
      <Tab.Screen name="Salary" options={{ tabBarLabel: 'Salary' }}>
        {() => <SalaryScreen onLogout={handleLogout} onSessionExpired={handleSessionExpired} />}
      </Tab.Screen>
      <Tab.Screen name="Shifts" options={{ tabBarLabel: 'Shifts' }}>
        {() => <ShiftsScreen onLogout={handleLogout} onSessionExpired={handleSessionExpired} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

const AUTH_KEYS = [
  'authToken', 'apiKey', 'authMethod',
  'userEmail', 'userName', 'isLoggedIn',
  'sessionId', 'employeeId', 'employeeName',
  'department', 'designation',
  'savedEmail', 'savedPassword',
];

export default function App() {
  const [appReady,  setAppReady]  = useState(false);
  const [siteReady, setSiteReady] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [loggedIn,  setLoggedIn]  = useState(false);
  const [loginKey,  setLoginKey]  = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const [siteOk, kioskOk, authOk] = await Promise.all([
          isSiteConfigured(),
          isKioskMode(),
          isAuthenticated(),
        ]);
        setSiteReady(siteOk);
        setKioskMode(kioskOk);

        if (!kioskOk && authOk && siteOk) {
          setLoggedIn(true);
        } else if (!kioskOk && siteOk && !authOk) {
          const reLoggedIn = await silentReLogin();
          setLoggedIn(reLoggedIn);
        }
      } catch (e) {
        console.warn('Init error:', e);
      } finally {
        setAppReady(true);
      }
    };
    init();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) await SplashScreen.hideAsync();
  }, [appReady]);

  // Called by SiteSetupScreen with { mode: 'employee' | 'kiosk' }
  const handleSiteConfigured = useCallback(({ mode }) => {
    setSiteReady(true);
    if (mode === 'kiosk') {
      setKioskMode(true);
    } else {
      setKioskMode(false);
      setLoggedIn(false);
    }
  }, []);

  // Called by KioskScreen admin exit
  const handleExitKiosk = useCallback((action) => {
    setKioskMode(false);
    if (action === 'changeSite') {
      setSiteReady(false);
      setLoggedIn(false);
    } else {
      setLoggedIn(false);
    }
  }, []);

  // Clear site + auth and go back to site setup
  const handleChangeSite = useCallback(() => {
    Alert.alert(
      'Change Site',
      'This will log you out and let you connect to a different site.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change Site',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              clearSiteConfig(),
              AsyncStorage.multiRemove(AUTH_KEYS),
            ]);
            setSiteReady(false);
            setLoggedIn(false);
          },
        },
      ]
    );
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setLoggedIn(true);
    setLoginKey((k) => k + 1);
  }, []);

  // Called when an API response signals the session expired.
  // Tries silent re-login first; only falls back to login screen if that fails.
  const handleSessionExpired = useCallback(async () => {
    const reLoggedIn = await silentReLogin();
    if (!reLoggedIn) {
      setLoggedIn(false);
    }
    // If reLoggedIn is true, the user stays on the current screen — they won't notice anything.
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try { await logout(); } catch (e) { console.warn('Logout error:', e); }
          setLoggedIn(false);
        },
      },
    ]);
  }, []);

  // ── Splash ──
  if (!appReady) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }

  // ── Site setup ──
  if (!siteReady) {
    return (
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SiteSetupScreen onSiteConfigured={handleSiteConfigured} />
      </View>
    );
  }

  // ── Kiosk mode ──
  if (kioskMode) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
            <KioskScreen onExitKiosk={handleExitKiosk} />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // ── Login ──
  if (!loggedIn) {
    return (
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onChangeSite={handleChangeSite}
        />
      </View>
    );
  }

  // ── Main App ──
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer onReady={onLayoutRootView}>
          <MainTabs
            loginKey={loginKey}
            handleLogout={handleLogout}
            handleSessionExpired={handleSessionExpired}
          />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  tabBar: {
    // height + paddingBottom are set dynamically in MainTabs using safe-area
    // insets, so the bar never gets covered by an Android 3-button nav bar.
    backgroundColor: '#fff',
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tabLabel:     { fontSize: 11, fontWeight: '600' },
  tabIcon:      { fontSize: 20 },
  tabIconActive: { transform: [{ scale: 1.1 }] },
});
