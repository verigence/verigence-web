import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.verigence.app',
  appName: 'Verigence',
  webDir: 'dist',
  backgroundColor: '#f4f8fb',
  loggingBehavior: 'production',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
