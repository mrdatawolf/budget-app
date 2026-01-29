import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.budgetapp.app',
  appName: 'Budget App',
  // Live server mode: loads from deployed Next.js server
  // Update this URL to your production deployment (e.g. Vercel)
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://your-app.vercel.app',
    cleartext: false,
  },
};

export default config;
