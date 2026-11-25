import * as SecureStore from 'expo-secure-store';

/** Session token storage: the device keychain / keystore on iOS and Android. */
export const tokenStore = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
