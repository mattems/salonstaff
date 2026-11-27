// Extends app.json with values that depend on environment variables.
// https://docs.expo.dev/workflow/configuration/#dynamic-configuration

/** `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc` */
function reversedClientId(clientId) {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const plugins = [...(config.plugins ?? [])];

  // Native Google Sign-In (no Firebase). The iOS URL scheme is the reversed iOS client ID.
  // Without an iOS client ID the plugin is skipped and the app falls back to the dev mock in __DEV__.
  if (iosClientId) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: reversedClientId(iosClientId) },
    ]);
  }

  // Release builds (scripts/testflight.sh) set a new build number each time.
  const buildNumber = process.env.IOS_BUILD_NUMBER?.trim();
  const ios = buildNumber ? { ...config.ios, buildNumber } : config.ios;

  return { ...config, ios, plugins };
};
