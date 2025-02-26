import { Debug, debug as d, Debugger } from 'debug';
import Emitter from 'component-emitter';
import nextTick from 'next-tick';
import extend from 'extend';
import facade from 'segmentio-facade';
import cloneDeep from 'lodash.clonedeep';
import pick from 'lodash.pick';
import * as qs from 'query-string';
import { ParsedQuery } from 'query-string';

import { version } from '../package.json';
import {
  IntegrationMiddlewareChain,
  Middleware,
  SourceMiddlewareChain,
  DestinationMiddlewareChain
} from './middleware';
import user from './entity/user';
import { default as groupEntity, Group as GroupEntity } from './entity/group';
import {
  Message,
  normalize,
  NormalizedMessage,
  Options,
  Properties
} from './messages';
import { pageDefaults } from './page';
import metrics from './metrics';

type Callback = () => void;

/**
 * Collection of options that can be set when initializing Analytics
 */
interface InitializeOptions {
  /**
   * Triggers an initial page call after initializing.
   */
  initialPageview?: boolean;

  /**
   * Collection of integrations that are enabled or disabled.  By default,
   * all integrations are enabled.
   */
  integrations?: IntegrationConfiguration;
}

type IntegrationName = string;
type Integrations = Record<IntegrationName, IntegrationConstructor>;

/**
 * A generic integration constructor.  See analytics.js-integrations.
 */
interface IntegrationConstructor<
  Options = Record<string, unknown>,
  IntegrationClass extends Emitter = Integration
> {
  new (options: Options): IntegrationClass;
}

interface Integration extends Emitter {
  name: string;
  options: Record<string, unknown>;
  page: () => void;
  ready: () => void;
  initialize: () => void;
  analytics: Analytics;
  invoke: (...rest: unknown[]) => void;
}

/**
 * Collection of Integrations that are either enabled or disabled.
 * By default, all integrations are enabled.
 */
export interface IntegrationConfiguration {
  All?: boolean;

  [key: string]: boolean;
}

interface AnalyticsQueryString {
  ajs_uid?: string;
  ajs_aid?: string;
  ajs_event?: string;

  [key: string]: unknown;
}

export class Analytics extends Emitter {
  public readonly VERSION: string;
  public readonly log: Debugger;
  public readonly Integrations: Integrations;
  public initializeOptions: InitializeOptions;
  public readonly user = user;
  _invoke: (...rest: unknown[]) => void;

  // TODO: Can these be private?
  public initialized: boolean;
  public failedInitializations = [];

  private _sourceMiddlewares: Middleware;
  private _integrationMiddlewares: Middleware;
  private _destinationMiddlewares: Record<string, Middleware>;
  private _integrations: Record<string, Integration>;
  private _readied: boolean;
  private _timeout: number;
  private _debug: Debug;

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
    this.initialized = false;

    this.on('initialize', (_, options) => {
      if (options.initialPageview) this.page();
      this._parseQuery(window.location.search);
    });
  }

  /** ***************
   * The initializer
   * /

   /**
   * Initialize with the given integration `settings`
   *
   * Aliased to `init` for convenience.
   * @this {Analytics}
   */
  initialize(
    settings?: IntegrationConfiguration,
    options?: InitializeOptions
  ): Analytics {
    settings = settings || {};
    options = options || {};

    this._options(options);
    this._readied = false;

    // clean unknown integrations from settings
    Object.keys(settings).forEach(key => {
      const Integration = this.Integrations[key];
      if (!Integration) delete settings[key];
    });

    // add integrations
    Object.keys(settings).forEach(key => {
      const opts = settings[key];
      const name = key;

      // Don't load disabled integrations
      if (options.integrations) {
        if (
          options.integrations[name] === false ||
          (options.integrations.All === false && !options.integrations[name])
        ) {
          return;
        }
      }

      const Integration = this.Integrations[name];
      const clonedOpts = {};
      extend(true, clonedOpts, opts); // deep clone opts
      const integration = new Integration(clonedOpts);
      this.log('initialize %o - %o', name, opts);
      this.add(integration);
    });

    const integrations = this._integrations;

    // load user now that options are set
    this.user.load();
    groupEntity.load();

    // make ready callback
    let readyCallCount = 0;
    const integrationCount = Object.keys(integrations).length;
    const ready = () => {
      readyCallCount++;
      if (readyCallCount >= integrationCount) {
        this._readied = true;
        this.emit('ready');
      }
    };

    // init if no integrations
    if (integrationCount <= 0) {
      ready();
    }

    // initialize integrations, passing ready
    // create a list of any integrations that did not initialize - this will be passed with all events for replay support:
    this.failedInitializations = [];
    let initialPageSkipped = false;
    Object.keys(integrations).forEach(key => {
      const integration = integrations[key];
      if (
        options.initialPageview &&
        integration.options.initialPageview === false
      ) {
        // We've assumed one initial pageview, so make sure we don't count the first page call.
        const page = integration.page;
        integration.page = function() {
          if (initialPageSkipped) {
            return page.apply(this, arguments);
          }
          initialPageSkipped = true;
          return;
        };
      }

      integration.analytics = this;

      integration.once('ready', ready);
      try {
        metrics.increment('analytics_js.integration.invoke', {
          method: 'initialize',
          integration_name: integration.name
        });
        integration.initialize();
      } catch (e) {
        const integrationName = integration.name;
        metrics.increment('analytics_js.integration.invoke.error', {
          method: 'initialize',
          integration_name: integration.name
        });
        this.failedInitializations.push(integrationName);
        this.log('Error initializing %s integration: %o', integrationName, e);
        // Mark integration as ready to prevent blocking of anyone listening to analytics.ready()

        integration.ready();
      }
    });

    // backwards compat with angular plugin and used for init logic checks
    this.initialized = true;

    this.emit('initialize', settings, options);
    return this;
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
    if (this.initializeOptions.integrations) {
      msg.integrations = {
        ...this.initializeOptions.integrations,
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
    if (this.initializeOptions.integrations) {
      msg.integrations = {
        ...this.initializeOptions.integrations,
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

    // normalize
    const msg = this.normalize({
      properties: properties as Record<string, unknown> | null,
      options: options as Record<string, unknown> | null,
      event: event
    });

    // Add the initialize integrations so the server-side ones can be disabled too
    // NOTE: We need to merge integrations, not override them with assign
    // since it is possible to change the initialized integrations at runtime.
    msg.integrations = {
      ...this.initializeOptions.integrations,
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
    properties = { ...properties, ...defs };

    // Mirror user overrides to `options.context.page` (but exclude custom properties)
    // (Any page defaults get applied in `this.normalize` for consistency.)
    // Weird, yeah--moving special props to `context.page` will fix this in the long term.
    const overrides = pick(properties, Object.keys(defs));
    const empty = Object.keys(overrides).some(k => overrides[k] === undefined);
    if (!empty) {
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
    if (this.initializeOptions.integrations) {
      msg.integrations = {
        ...this.initializeOptions.integrations,
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
    if (this.initializeOptions.integrations) {
      msg.integrations = {
        ...this.initializeOptions.integrations,
        ...msg.integrations
      };
    }

    this._invoke('alias', new facade.Alias(msg));

    this.emit('alias', to, from, options);
    this._callback(fn);
    return this;
  }

  /** ***************
   *  Helper "track" methods
   */

  /**
   * Helper method to track an outbound form that would normally navigate away
   * from the page before the analytics calls were sent.
   *
   * @param {Element|Array} forms
   * @param {string|Function} event
   * @param {Object|Function} properties (optional)
   * @return {Analytics}
   */
  trackForm(
    forms?: HTMLFormElement | Array<HTMLFormElement>,
    event?: string | ((el: HTMLFormElement) => string),
    properties?: Properties | ((el: HTMLFormElement) => Properties)
  ): Analytics {
    if (!forms && !event) {
      return this;
    }

    if (!Array.isArray(forms)) {
      forms = [forms];
    }

    const elements = forms;

    elements.forEach(el => {
      if (!(el instanceof Element)) {
        throw new TypeError('Must pass HTMLElement to `analytics.trackForm`.');
      }
      el.onsubmit = (e: Event) => {
        e.preventDefault();

        const ev = typeof event === 'function' ? event(el) : event;
        const props =
          typeof properties === 'function' ? properties(el) : properties;
        this.track(ev, props);

        this._callback(function() {
          el.submit();
        });
      };
      el.submit();
    });

    return this;
  }

  /**
   * Helper method to track an outbound link that would normally navigate away
   * from the page before the analytics calls were sent.
   *
   *
   * @param {Element|Array} links
   * @param {string|Function} event
   * @param {Object|Function} properties (optional)
   * @return {Analytics}
   */
  trackLink(
    links: HTMLAnchorElement | Array<HTMLAnchorElement>,
    event?: string | ((el: HTMLAnchorElement) => string),
    properties?: Properties | ((el: HTMLAnchorElement) => Properties)
  ): Analytics {
    if (!Array.isArray(links)) {
      links = [links];
    }

    links.forEach(el => {
      if (!(el instanceof Element)) {
        throw new TypeError('Must pass HTMLElement to `analytics.trackLink`.');
      }
      el.onclick = (e: MouseEvent) => {
        const ev = typeof event === 'function' ? event(el) : event;
        const props =
          typeof properties === 'function' ? properties(el) : properties;

        const href =
          el.getAttribute('href') ||
          el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          el.getAttribute('xlink:href');

        this.track(ev, props);

        if (href && el.target !== '_blank') {
          e.preventDefault();

          this._callback(function() {
            window.location.href = href;
          });
        }
      };
    });

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
  add(integration: Integration): Analytics {
    this._integrations[integration.name] = integration;
    return this;
  }

  /**
   * Define a new `Integration`.
   */
  addIntegration(Integration: IntegrationConstructor): Analytics {
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
    msg.context.page = { ...pageDefaults(), ...msg.context.page };

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
   * Define a new `SourceMiddleware`
   */
  addSourceMiddleware(middleware: Function): Analytics {
    this._sourceMiddlewares.add(middleware);
    return this;
  }

  /**
   * Define a new `IntegrationMiddleware`
   * @deprecated
   */
  addIntegrationMiddleware(middleware: Function): Analytics {
    this._integrationMiddlewares.add(middleware);
    return this;
  }

  /**
   * Define a new `DestinationMiddleware`
   * Destination Middleware is chained after integration middleware
   */
  addDestinationMiddleware(
    integrationName: string,
    middlewares: Array<Middleware>
  ): Analytics {
    middlewares.forEach(middleware => {
      if (!this._destinationMiddlewares[integrationName]) {
        this._destinationMiddlewares[
          integrationName
        ] = new DestinationMiddlewareChain();
      }

      this._destinationMiddlewares[integrationName].add(middleware);
    });
    return this;
  }

  /**
   * Apply options.
   */
  private _options(options: InitializeOptions): Analytics {
    options = options || {};
    this.initializeOptions = options;
    return this;
  }

  push(args: string[]) {
    const method = args.shift();
    if (!this[method]) return;
    this[method].apply(this, args);
  }
}
