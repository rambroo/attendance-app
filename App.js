import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ActivityIndicator, StyleSheet,
  Text, TouchableOpacity, Alert,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
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
import { isAuthenticated, logout, silentReLogin, clearSavedCredentials } from './src/api/authApi';
import { isSiteConfigured, isKioskMode, clearSiteConfig } from './src/utils/siteConfig';
import { resetServerCaps } from './src/utils/serverCaps';
import { C, themed, useThemeName, loadSavedTheme } from './src/utils/theme';
import { getBuildTag } from './src/utils/buildInfo';

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
        tabBarInactiveTintColor: C.textMuted,
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
];

// Catches unexpected render/runtime errors so a release build shows a
// recoverable screen instead of hard-crashing (protects Play Store vitals).
class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error || new Error('Unknown error') };
  }

  componentDidCatch(error, info) {
    console.warn('Unhandled app error:', error, info?.componentStack);
  }

  // Re-rendering the same JS bundle cannot recover from a deterministic render
  // bug — the same code throws again, which is why "Reload" used to appear to do
  // nothing and users resorted to reinstalling. A real bundle reload also applies
  // any fixed OTA update that expo-updates has downloaded since launch.
  handleRetry = async () => {
    if (Updates.isEnabled) {
      try {
        await Updates.reloadAsync();
        return;
      } catch { /* not reloadable here (e.g. Expo Go) — fall back to a soft retry */ }
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>
            An unexpected error occurred. Tap below to reload the app.
          </Text>
          {/* Release builds strip console output, so without this the only
              evidence of a crash is a user's description of it. */}
          <Text style={styles.errorDetail} selectable numberOfLines={4}>
            {String(this.state.error?.message || '').slice(0, 300)}
          </Text>
          {/* So a screenshot of a crash also says which version crashed. */}
          <Text style={styles.errorBuild}>{getBuildTag()}</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={this.handleRetry} activeOpacity={0.85}>
            <Text style={styles.errorBtnText}>Reload</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function Root() {
  // Stylesheets are refilled in place on a theme change (see utils/theme.js),
  // but memoised subtrees would keep their old rendered output. Keying the
  // whole tree on the theme name remounts everything, which is cheap for an
  // action this rare and guarantees nothing is left half-restyled.
  const themeName = useThemeName();
  const [appReady,  setAppReady]  = useState(false);
  const [siteReady, setSiteReady] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [loggedIn,  setLoggedIn]  = useState(false);
  const [loginKey,  setLoginKey]  = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        // Restore the theme before anything paints, so a Midnight/Onyx user
        // never sees a frame of the light theme while the splash lifts.
        const [siteOk, kioskOk, authOk] = await Promise.all([
          isSiteConfigured(),
          isKioskMode(),
          isAuthenticated(),
          loadSavedTheme(),
        ]);
        setSiteReady(siteOk);
        setKioskMode(kioskOk);

        if (!kioskOk && authOk && siteOk) {
          // Cold start is offline-safe: no network call here. If the server-side
          // session has lapsed, the first API call reports it and we recover
          // through handleSessionExpired below.
          setLoggedIn(true);
        } else if (!kioskOk && siteOk && !authOk) {
          const { ok } = await silentReLogin();
          setLoggedIn(ok);
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
            // Caps are keyed on siteUrl, so drop them before it is cleared.
            await resetServerCaps();
            await Promise.all([
              clearSiteConfig(),
              AsyncStorage.multiRemove(AUTH_KEYS),
              clearSavedCredentials(),
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
  // Tries silent re-login first; only falls back to the login screen when the
  // credentials themselves are gone or rejected. A network failure here is NOT
  // a logout — the user keeps their session and their cached data, and the next
  // request retries. This is what stopped users being bounced to login on a
  // weak connection.
  const handleSessionExpired = useCallback(async () => {
    const { ok, reason } = await silentReLogin();
    if (!ok && reason !== 'network') {
      setLoggedIn(false);
    }
  }, []);

  const handleSwitchToKiosk = useCallback(() => {
    setKioskMode(true);
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
      <View key={themeName} style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SiteSetupScreen onSiteConfigured={handleSiteConfigured} />
      </View>
    );
  }

  // ── Kiosk mode ──
  if (kioskMode) {
    return (
      <GestureHandlerRootView key={themeName} style={{ flex: 1 }}>
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
      <View key={themeName} style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onChangeSite={handleChangeSite}
          onKioskMode={handleSwitchToKiosk}
        />
      </View>
    );
  }

  // ── Main App ──
  return (
    <GestureHandlerRootView key={themeName} style={{ flex: 1 }}>
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

export default function App() {
  return (
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  );
}

const styles = themed(() => StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  errorRoot: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.bg, padding: 32,
  },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: C.textPrimary, marginBottom: 8 },
  errorBody:  { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 12 },
  errorDetail: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginBottom: 8, fontFamily: 'monospace' },
  errorBuild:  { fontSize: 11, color: C.textMuted, textAlign: 'center', marginBottom: 24 },
  errorBtn: {
    backgroundColor: C.brand, borderRadius: 50,
    paddingVertical: 14, paddingHorizontal: 48,
  },
  errorBtnText: { color: C.onBrand, fontSize: 15, fontWeight: '700' },
  tabBar: {
    // height + paddingBottom are set dynamically in MainTabs using safe-area
    // insets, so the bar never gets covered by an Android 3-button nav bar.
    backgroundColor: C.card,
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 10,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tabLabel:     { fontSize: 11, fontWeight: '600' },
  tabIcon:      { fontSize: 20 },
  tabIconActive: { transform: [{ scale: 1.1 }] },
}));
