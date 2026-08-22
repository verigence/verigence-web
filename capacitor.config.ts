import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.verigence.app',
  appName: 'Verigence',
  webDir: 'dist',
  backgroundColor: '#011e47',
  loggingBehavior: 'debug',
  server: {
    hostname: 'localhost',
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
  ios: {
    preferredContentMode: 'mobile',
  },
};

export default config;
