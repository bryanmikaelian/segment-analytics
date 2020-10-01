import { Debug, debug as d, Debugger } from 'debug';
import Emitter from 'component-emitter';
import nextTick from 'next-tick';

import { version } from '../package.json';
import {
  InitOptions,
  IntegrationsSettings,
  PageDefaults,
  SegmentAnalytics,
  SegmentIntegration,
  SegmentOpts
} from './types';
import {
  SourceMiddlewareChain,
  IntegrationMiddlewareChain
} from './middleware';
import user from './entity/user';
import { Group } from './entity/group';

export class Analytics extends Emitter {
  public readonly VERSION: string;
  public readonly log: Debugger;
  public readonly Integrations: {
    [name: string]: (options: SegmentOpts) => void;
  };
  public options: SegmentOpts;
  public readonly user = user;

  private _sourceMiddlewares: unknown;
  private _integrationMiddlewares: unknown;
  private _destinationMiddlewares: unknown;
  private _integrations: unknown;
  private _readied: boolean;
  private _timeout: number;
  private _debug: Debug;

  // TODO: These functions are all prototyped in legacy/index.ts.  Eventually migrate them to here

  // The initialize functions
  init: (
    settings?: IntegrationsSettings,
    options?: InitOptions
  ) => SegmentAnalytics;
  initialize: (
    settings?: IntegrationsSettings,
    options?: InitOptions
  ) => SegmentAnalytics;

  // The core Segment functions
  track: (
    event: string,
    properties?: unknown,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics;

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

  // TODO: A Segment `GROUP` call should be inndependent of the current group
  group: (
    id: string,
    traits?: unknown,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics | Group;

  alias: (
    to: string,
    from?: string,
    options?: unknown,
    fn?: unknown
  ) => SegmentAnalytics;

  // Random util functions
  addSourceMiddleware: (middleware: Function) => SegmentAnalytics;
  addIntegrationMiddleware: (middleware: Function) => SegmentAnalytics;
  addDestinationMiddleware: (
    integrationName: string,
    middlewares: Array<unknown>
  ) => SegmentAnalytics;
  setAnonymousId: (id: string) => SegmentAnalytics;
  add: (integration: { name: string | number }) => SegmentAnalytics;
  pageview: (url: string) => SegmentAnalytics;
  reset: () => void;
  normalize: (
    msg: {
      options: { [key: string]: unknown };
      context: { page: Partial<PageDefaults> };
      anonymousId: string;
    }
  ) => object;
  noConflict: () => SegmentAnalytics;
  trackClick: (
    forms: Element | Array<unknown> | JQuery,
    event: any,
    properties?: any
  ) => SegmentAnalytics;
  trackLink: (
    forms: Element | Array<unknown> | JQuery,
    event: any,
    properties?: any
  ) => SegmentAnalytics;
  trackSubmit: (
    forms: Element | Array<unknown>,
    event: any,
    properties?: any
  ) => SegmentAnalytics;
  trackForm: (
    forms: Element | Array<unknown>,
    event: any,
    properties?: any
  ) => SegmentAnalytics;
  push: (args: any[]) => void;

  _mergeInitializeAndPlanIntegrations: (
    planIntegrations: SegmentIntegration
  ) => object;
  _options: (opts: InitOptions) => SegmentAnalytics;
  _invoke: (method: string, facade: unknown) => SegmentAnalytics;
  _parseQuery: (query: string) => SegmentAnalytics;

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
    this.log = d('analytics.js');
    this._debug = d;

    this.on('initialize', (_, options) => {
      if (options.initialPageview) this.page();
      this._parseQuery(window.location.search);
    });
  }

  /**
   * Use a `plugin`.
   */
  use(fn: (analytics: Analytics) => void): Analytics {
    fn(this);
    return this;
  }

  /**
   * Define a new `Integration`.
   */
  addIntegration(Integration: (options: SegmentOpts) => void): Analytics {
    const name = Integration.prototype.name;
    if (!name) throw new TypeError('attempted to add an invalid integration');
    this.Integrations[name] = Integration;
    return this;
  }

  /**
   * Set the `timeout` (in milliseconds) used for callbacks.
   */
  timeout(timeout: number): void {
    this._timeout = timeout;
  }

  /**
   * Enable or disable debug.
   */
  debug(enable: boolean): void {
    if (enable) {
      this._debug.enable('analytics:*');
    } else {
      this._debug.disable();
    }
  }

  /**
   * Register a `fn` to be fired when all the analytics services are ready.
   */
  ready(fn?: () => void): Analytics {
    if (!fn) {
      return this;
    }

    if (this._readied) {
      nextTick(fn);
    } else {
      this.once('ready', fn);
    }
    return this;
  }

  private _callback(fn?: () => void): Analytics {
    if (!fn) {
      return this;
    }
    this._timeout ? setTimeout(fn, this._timeout) : nextTick(fn);
    return this;
  }
}
