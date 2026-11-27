import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mashhad.video',
  appName: 'مشهد',
  webDir: 'dist',
  backgroundColor: '#0d0c0b',
  android: {
    backgroundColor: '#0d0c0b',
  },
  plugins: {
    // صوت Google المجاني يمر من التطبيق مباشرة، فنتجاوز قيد CORS عبر أداة Capacitor الأصلية.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
