import { Debug, debug as d, Debugger } from 'debug';
import Emitter from 'component-emitter';
import nextTick from 'next-tick';
import extend from 'extend';

import { version } from '../package.json';
import {
  InitOptions,
  IntegrationsSettings,
  SegmentAnalytics,
  SegmentIntegration,
  SegmentOpts
} from './types';
import {
  SourceMiddlewareChain,
  IntegrationMiddlewareChain
} from './middleware';
import user from './entity/user';
import { default as groupEntity, Group } from './entity/group';
import * as qs from 'query-string';
import { ParsedQuery } from 'query-string';
import { Message, normalize, NormalizedMessage } from './messages';
import { pageDefaults } from './page';
import cookie from './entity/store/cookie';
import metrics from './metrics';
import store from './entity/store/local';

interface AnalyticsQueryString {
  ajs_uid?: string;
  ajs_aid?: string;
  ajs_event?: string;
  [key: string]: unknown;
}

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
    id?: string,
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
  pageview: (url: string) => SegmentAnalytics;
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

  _invoke: (method: string, facade: unknown) => SegmentAnalytics;

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
   * Add an integration.
   */
  add(integration: { name: string | number }): Analytics {
    this._integrations[integration.name] = integration;
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

  /**
   * Reset group and user traits and id's.
   */
  reset(): void {
    this.user.logout();
    (this.group() as Group).logout();
  }

  /**
   * Normalize the given `msg`.
   *
   * @return {NormalizedMessage}
   */
  normalize(message: Message): NormalizedMessage {
    const msg = normalize(message, Object.keys(this._integrations));
    if (msg.anonymousId) this.user.anonymousId(msg.anonymousId);
    msg.anonymousId = this.user.anonymousId();

    // Ensure all outgoing requests include page data in their contexts.
    msg.context.page = {
      ...pageDefaults(),
      ...msg.context.page
    };

    return msg;
  }
  /**
   * Set the user's `id`.
   */

  setAnonymousId(id: string): Analytics {
    this.user.anonymousId(id);
    return this;
  }

  /**
   * No conflict support.
   */
  noConflict(): Analytics {
    window.analytics = global.analytics;
    return this;
  }

  private _callback(fn?: () => void): Analytics {
    if (!fn) {
      return this;
    }
    this._timeout ? setTimeout(fn, this._timeout) : nextTick(fn);
    return this;
  }

  /**
   * Parse the query string for callable methods.
   *
   * @api private
   */
  private _parseQuery(query: string): Analytics {
    // Parse querystring to an object
    const q = (qs.parse(query) as unknown) as ParsedQuery<AnalyticsQueryString>;
    const keys = Object.keys(q);
    const results = { traits: {}, props: {} };

    keys.forEach(p => {
      if (p.includes('ajs_trait_')) {
        const key = p.replace('ajs_trait_', '');
        results.traits[key] = q[p];
      }

      if (p.includes('ajs_prop_')) {
        const key = p.replace('ajs_prop_', '');
        results.props[key] = q[p];
      }
    });

    const { traits, props } = results;

    // Trigger based on callable parameters in the URL
    if (q.ajs_uid && typeof q.ajs_uid === 'string') {
      this.identify(q.ajs_uid, traits);
    }
    if (q.ajs_event && typeof q.ajs_event === 'string') {
      this.track(q.ajs_event, props);
    }
    if (q.ajs_aid && typeof q.ajs_aid === 'string') {
      this.user.anonymousId(q.ajs_aid);
    }

    return this;
  }

  /**
   * Apply options.
   */
  private _options(options: InitOptions): Analytics {
    options = options || {};
    this.options = options;
    cookie.options = options.cookie;
    metrics.options(options.metrics);
    store.options = options.localStorage;
    this.user.options = options.user;
    groupEntity.options = options.group;
    return this;
  }

  /**
   * Merges the tracking plan and initialization integration options.
   *
   * @param  {Object} planIntegrations Tracking plan integrations.
   * @return {Object}                  The merged integrations.
   */
  private _mergeInitializeAndPlanIntegrations(
    planIntegrations: SegmentIntegration
  ): Record<string, unknown> {
    // Do nothing if there are no initialization integrations
    if (!this.options.integrations) {
      return planIntegrations;
    }

    // Clone the initialization integrations
    let integrations = extend({}, this.options.integrations);
    let integrationName: string;

    // Allow the tracking plan to disable integrations that were explicitly
    // enabled on initialization
    if (planIntegrations.All === false) {
      integrations = { All: false };
    }

    for (integrationName in planIntegrations) {
      if (planIntegrations.hasOwnProperty(integrationName)) {
        // Don't allow the tracking plan to re-enable disabled integrations
        if (this.options.integrations[integrationName] !== false) {
          integrations[integrationName] = planIntegrations[integrationName];
        }
      }
    }

    return integrations;
  }
}
