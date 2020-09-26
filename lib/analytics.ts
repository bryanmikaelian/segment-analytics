import { debug } from 'debug';
import Emitter from 'component-emitter';

import { version } from '../package.json';
import {
  InitOptions,
  IntegrationsSettings,
  PageDefaults,
  SegmentAnalytics,
  SegmentIntegration,
  SegmentOpts
} from './types';
import { SourceMiddlewareChain, IntegrationMiddlewareChain } from './middleware';
import user from './user';

export class Analytics extends Emitter {
  public readonly VERSION: string;
  public readonly log: (args: string) => void;
  public readonly Integrations: { [name: string]: (options: SegmentOpts) => void };
  public options: SegmentOpts;

  private _sourceMiddlewares: unknown;
  private _integrationMiddlewares: unknown;
  private _destinationMiddlewares: unknown;
  private _integrations: unknown;
  private _readied: boolean;
  private _timeout: number;
  private _user: unknown;

  // TODO: These functions are all prototyped in legacy/index.ts.  Eventually migrate them to here

  // The initialize functions
  init: (settings?: IntegrationsSettings, options?: InitOptions) => SegmentAnalytics;
  initialize: (settings?: IntegrationsSettings, options?: InitOptions) => SegmentAnalytics;

  // The core Segment functions
  track: (
    event: string,
    properties?: unknown,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics

  page: (
    category?: string,
    name?: string,
    properties?: any,
    options?: any,
    fn?: unknown
  ) => SegmentAnalytics;

  identify: (
    id?: string,
    traits?: unknown,
    options?: SegmentOpts,
    fn?: Function | SegmentOpts
  ) => SegmentAnalytics;

  group: (
    id: string,
    traits?: unknown,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics;

  alias: (
    to: string,
    from?: string,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics

  // Random util functions

  use: (plugin: (analytics: SegmentAnalytics) => void) => SegmentAnalytics;
  addIntegration: (Integration: (options: SegmentOpts) => void) => SegmentAnalytics;
  addSourceMiddleware: (middleware: Function) => SegmentAnalytics;
  addIntegrationMiddleware: (middleware: Function) => SegmentAnalytics;
  addDestinationMiddleware: (integrationName: string, middlewares: Array<unknown>) => SegmentAnalytics;
  setAnonymousId: (id: string) => SegmentAnalytics;
  add: (integration: { name: string | number }) => SegmentAnalytics;
  user: () => object;
  pageview: (url: string) => SegmentAnalytics
  ready: (fn: Function) => SegmentAnalytics
  timeout: (timeout: number) => void
  debug: (str: string | boolean) => void
  reset: () => void
  normalize: (msg: {
    options: { [key: string]: unknown },
    context: { page: Partial<PageDefaults> },
    anonymousId: string
  }) => object;
  noConflict: () => SegmentAnalytics
  trackClick: (forms: Element | Array<unknown> | JQuery, event: any, properties?: any) => SegmentAnalytics
  trackLink: (forms: Element | Array<unknown> | JQuery, event: any, properties?: any) => SegmentAnalytics
  trackSubmit: (forms: Element | Array<unknown>, event: any, properties?: any) => SegmentAnalytics
  trackForm: (forms: Element | Array<unknown>, event: any, properties?: any) => SegmentAnalytics
  push: (args: any[]) => void

  _mergeInitializeAndPlanIntegrations: (planIntegrations: SegmentIntegration) => object;
  _options: (opts: InitOptions) => SegmentAnalytics
  _callback: (fn: Function) => SegmentAnalytics
  _invoke: (method: string, facade: unknown) => SegmentAnalytics
  _parseQuery: (query: string) => SegmentAnalytics

  constructor() {
    super();

    this.VERSION = version;
    this._options({});
    this.Integrations = {};
    this._sourceMiddlewares = new SourceMiddlewareChain();
    this._integrationMiddlewares = new IntegrationMiddlewareChain();
    this._destinationMiddlewares = {};
    this._integrations = {};
    this._readied = false;
    this._timeout = 300;
    // XXX: BACKWARDS COMPATIBILITY
    this._user = user;
    this.log = debug('analytics.js');

    this.on('initialize', (_, options) => {
      if (options.initialPageview) this.page();
      this._parseQuery(window.location.search);
    });
  }
}
