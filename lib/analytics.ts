import { Debug, debug as d, Debugger } from 'debug';
import Emitter from 'component-emitter';
import nextTick from 'next-tick';
import extend from 'extend';
import facade from 'segmentio-facade';
import is from 'is';

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
import { default as groupEntity, Group as GroupEntity } from './entity/group';
import * as qs from 'query-string';
import { ParsedQuery } from 'query-string';
import {
  Message,
  normalize,
  NormalizedMessage,
  Options,
  Properties
} from './messages';
import { pageDefaults } from './page';
import cookie from './entity/store/cookie';
import metrics from './metrics';
import store from './entity/store/local';
import cloneDeep from 'lodash.clonedeep';
import pick from 'lodash.pick';

type Callback = () => void;

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

  /** ****************
   * The Core Methods
   *
   * TODO: These signatures are all weird and I hate it. It's basically a poor-mans overloaded function with arguments shifting around.
   * We need to re-visit each signature or overload the function appropriately.  It's encouraging bad API behavior and it's difficult to test
   */

  /**
   * Identify a user by optional `id` and `traits`.
   *
   * @param {string | Callback} [id=user.id] User ID.
   * @param {Record<string, unknown> | Callback} [traits=null] User traits.
   * @param {Options | Callback} [options=null]
   * @param {Callback} [fn]
   * @return {Analytics}
   */
  identify(
    id: string | Callback,
    traits?: Record<string, unknown> | Callback,
    options?: Options | Callback,
    fn?: Callback
  ): Analytics {
    // identify("1", {}, () => void)
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }

    // identify("1", () => void)
    if (typeof traits === 'function') {
      fn = traits;
      options = null;
      traits = null;
    }

    // identify({})
    if (typeof id === 'object') {
      options = traits;
      traits = id;
      id = this.user.id;
    }

    // clone traits before we manipulate so we don't do anything uncouth, and take
    // from `user` so that we carryover anonymous traits
    this.user.identify(id as string, traits as Record<string, unknown> | null);

    const msg = this.normalize({
      options: options as Options | null,
      traits: this.user.traits,
      userId: this.user.id
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('identify', new facade.Identify(msg));

    // emit
    this.emit('identify', id, traits, options);
    if (typeof fn === 'function') {
      this._callback(fn);
    }
    return this;
  }

  /**
   * Identify a group by optional `id` and `traits`. Or, if no arguments are
   * supplied, return the current group.
   *
   * @param {string} [id=group.id()] Group ID.
   * @param {Record<string, unknown> | Callback} [traits=null] Group traits.
   * @param {Options | Callback} [options=null]
   * @param {Callback} [fn]
   * @return {Analytics}
   */
  group(
    id?: string | Record<string, unknown>,
    traits?: Record<string, unknown> | Callback,
    options?: Options | Callback,
    fn?: Callback
  ): Analytics | GroupEntity {
    // TODO: This maybe shouldn't live here?
    if (!arguments.length) return groupEntity as GroupEntity;

    // group("1", {}, () => void)
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }

    // group("1", () => void)
    if (typeof traits === 'function') {
      fn = traits;
      options = null;
      traits = null;
    }

    // group({})
    if (typeof id === 'object') {
      options = traits;
      traits = id;
      id = groupEntity.id;
    }

    // grab from group again to make sure we're taking from the source
    groupEntity.identify(id, traits as Record<string, unknown> | null);

    const msg = this.normalize({
      options: options as Options | null,
      traits: groupEntity.traits,
      groupId: groupEntity.id
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('group', new facade.Group(msg));

    this.emit('group', id, traits, options);
    this._callback(fn);
    return this;
  }

  /**
   * Track an `event` that a user has triggered with optional `properties`.
   *
   * @param {string} event
   * @param {Object} [properties=null]
   * @param {Object} [options=null]
   * @param {Function} [fn]
   * @return {Analytics}
   */
  track(
    event: string,
    properties?: Properties | Callback,
    options?: Options | Callback,
    fn?: Callback
  ): Analytics {
    // track("event", {}, () => void)
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }

    // track("event", () => void)
    if (typeof properties === 'function') {
      fn = properties;
      options = null;
      properties = null;
    }

    // figure out if the event is archived.
    let plan = this.options.plan || {};
    const events = plan.track || {};
    let planIntegrationOptions = {};

    // normalize
    const msg = this.normalize({
      properties: properties as Record<string, unknown> | null,
      options: options as Record<string, unknown> | null,
      event: event
    });

    // plan.
    plan = events[event];
    if (plan) {
      this.log('plan %o - %o', event, plan);
      if (plan.enabled === false) {
        // Disabled events should always be sent to Segment.
        planIntegrationOptions = { All: false, 'Segment.io': true };
      } else {
        planIntegrationOptions = plan.integrations || {};
      }
    } else {
      const defaultPlan = events.__default || { enabled: true };
      if (!defaultPlan.enabled) {
        // Disabled events should always be sent to Segment.
        planIntegrationOptions = { All: false, 'Segment.io': true };
      }
    }

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    msg.integrations = {
      ...this._mergeInitializeAndPlanIntegrations(planIntegrationOptions),
      ...msg.integrations
    };

    this._invoke('track', new facade.Track(msg));

    this.emit('track', event, properties, options);
    this._callback(fn);
    return this;
  }

  /**
   * Trigger a pageview, labeling the current page with an optional `category`,
   * `name` and `properties`.
   *
   * @param {string} [category]
   * @param {string} [name]
   * @param {Object|string} [properties] (or path)
   * @param {Object} [options]
   * @param {Function} [fn]
   * @return {Analytics}
   */
  page(
    category?: string | Record<string, unknown>,
    name?: string | Record<string, unknown> | Callback,
    properties?: Properties | Callback,
    options?: Options | Callback,
    fn?: Callback
  ): Analytics {
    // page("foo", "bar", {}, () => void) OR
    // page("foo", {}, {}, () => void)
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }

    // page("foo", "bar", () => void)
    if (typeof properties === 'function') {
      fn = properties;
      options = null;
      properties = null;
    }

    // page("foo", () => void)
    if (typeof name === 'function') {
      fn = name;
      options = null;
      properties = null;
      name = null;
    }

    // page({}, ...rest)
    if (category && typeof category === 'object') {
      options =
        typeof name === 'object' ? (name as Record<string, unknown>) : {};
      properties = category as Record<string, unknown>;
      name = null;
      category = null;
    }

    // page("foo",  {}, ...rest)
    if (name && typeof name === 'object') {
      options = properties;
      // NOTE: Name will be set below
      properties = name;
      name = null;
    }

    // page("foo", {}, {}, {})
    if (typeof category === 'string' && typeof name !== 'string') {
      options = properties;
      name = category;
      category = null;
    }

    if (properties) {
      properties = cloneDeep(properties) as Properties;
      if (name) {
        (properties as Properties).name = name as string;
      }
      if (category) {
        (properties as Properties).category = category as string;
      }
    }

    // Ensure properties has baseline spec properties.
    // TODO: Eventually move these entirely to `options.context.page`
    // FIXME: This is purposely not overriding `defs`. There was a bug in the logic implemented by `@ndhoule/defaults`.
    //        This bug made it so we only would overwrite values in `defs` that were set to `undefined`.
    //        In some cases, though, pageDefaults  will return defaults with values set to "" (such as `window.location.search` defaulting to "").
    //        The decision to not fix this bus was made to preserve backwards compatibility.
    const defs = pageDefaults();
    properties = {
      ...properties,
      ...defs
    };

    // Mirror user overrides to `options.context.page` (but exclude custom properties)
    // (Any page defaults get applied in `this.normalize` for consistency.)
    // Weird, yeah--moving special props to `context.page` will fix this in the long term.
    const overrides = pick(properties, Object.keys(defs));
    if (!is.empty(overrides)) {
      options = (options || {}) as Options;
      options.context = options.context || {};
      options.context.page = overrides;
    }

    const msg = this.normalize({
      properties: properties,
      category: category,
      options: options as Options,
      name: name
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('page', new facade.Page(msg));

    this.emit('page', category, name, properties, options);
    this._callback(fn);
    return this;
  }

  /**
   * Merge two previously unassociated user identities.
   *
   * @param {string} to
   * @param {string} from (optional)
   * @param {Object} options (optional)
   * @param {Function} fn (optional)
   * @return {Analytics}
   */
  alias(
    to: string,
    from?: string | Callback,
    options?: Options | Callback,
    fn?: Callback
  ): Analytics {
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }

    if (typeof from === 'function') {
      fn = from;
      options = null;
      from = null;
    }

    if (from && typeof from === 'object') {
      options = from;
      from = null;
    }

    const msg = this.normalize({
      options: options as Options,
      previousId: from,
      userId: to
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    if (this.options.integrations) {
      msg.integrations = {
        ...this.options.integrations,
        ...msg.integrations
      };
    }

    this._invoke('alias', new facade.Alias(msg));

    this.emit('alias', to, from, options);
    this._callback(fn);
    return this;
  }

  /** ****************
   * The Util Methods
   * *****************/

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
    (this.group() as GroupEntity).logout();
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

  _callback(fn?: () => void): Analytics {
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
  ): SegmentIntegration {
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
