import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smarterp.pos',
  appName: 'Smart ERP & POS',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Splash: {
      launchShowDuration: 2000,
      backgroundColor: "#2563eb",
      showSpinner: true,
      androidScaleType: "CENTER_CROP"
    }
  }
};

export default config;
