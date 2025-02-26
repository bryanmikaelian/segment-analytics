import { Analytics } from './analytics';

declare global {
  namespace NodeJS {
    interface Global {
      analytics: Analytics;
    }
  }
  interface Window {
    analytics: Analytics;
  }
}

export {};
