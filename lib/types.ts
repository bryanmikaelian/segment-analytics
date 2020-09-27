/**
 * @deprecated Use `Analytics` in `lib/analytics.ts`
 */
import { StoreOptions } from './store';
import { CookieOptions } from './cookie';

export interface SegmentAnalytics {
  Integrations: { [name: string]: (options: SegmentOpts) => void };
  options: InitOptions;
  require: any
  VERSION: any

  // Analytics.JS Methods
  page: (
    category?: string,
    name?: string,
    properties?: any,
    options?: any,
    fn?: unknown
  ) => void

  // Private fields
}

export interface IntegrationsSettings {
  // TODO remove `any`
  [key: string]: any;
}

export interface MetricsOptions {
  host?: string;
  sampleRate?: number;
  flushTimer?: number;
  maxQueueSize?: number;
}

export interface UserOptions {
  cookie?: {
    key: string;
    oldKey: string;
  };
  localStorage?: {
    key: string;
  };
  persist?: boolean;
}

export interface GroupOptions {
  cookie?: {
    key: string;
  };
  localStorage?: {
    key: string;
  };
  persist?: boolean;
}

export interface InitOptions {
  initialPageview?: boolean;
  cookie?: CookieOptions;
  metrics?: MetricsOptions;
  localStorage?: StoreOptions;
  user?: UserOptions;
  group?: GroupOptions;
  integrations?: SegmentIntegration;
}

export interface SegmentIntegration {
  All?: boolean;
  [integration: string]: boolean | undefined;
}

export interface SegmentOpts {
  integrations?: any;
  anonymousId?: string;
  context?: object;
}

export interface Message {
  options?: unknown;
  integrations?: { [key: string]: string };
  providers?: { [key: string]: string | boolean };
  context?: unknown;
  messageId?: string;
}

export interface PageDefaults {
  path: string;
  referrer: string;
  search: string;
  title: string;
  url: string;
}
