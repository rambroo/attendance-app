import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Hardware-backed (Android Keystore / iOS Keychain) storage for secrets:
// the saved login password and the kiosk API key. Everything else stays in
// AsyncStorage — only secrets belong here.
//
// Reads transparently migrate values that older builds stored in plain
// AsyncStorage, then delete the plaintext copy.

export const setSecret = async (key, value) => {
  if (value == null) return;
  await SecureStore.setItemAsync(key, String(value));
};

export const getSecret = async (key) => {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value != null) return value;
  } catch { /* fall through to migration path */ }

  // Migrate from plaintext AsyncStorage (pre-1.1.0 builds)
  const legacy = await AsyncStorage.getItem(key);
  if (legacy != null) {
    try {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    } catch { /* keep legacy copy if secure write fails */ }
    return legacy;
  }
  return null;
};

export const deleteSecret = async (key) => {
  try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
};
