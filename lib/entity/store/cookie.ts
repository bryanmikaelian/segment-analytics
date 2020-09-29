import cloneDeep from 'lodash.clonedeep';
import { default as d, Debugger } from 'debug';
import cookie from '@segment/cookie';
import topDomain from '@segment/top-domain';

const MAX_AGE_ONE_YEAR = 31536000000;

const DEFAULTS: CookieOptions = {
  maxage: MAX_AGE_ONE_YEAR,
  path: '/',
  sameSite: 'Lax'
};

export interface CookieOptions {
  enabled?: boolean;
  maxage?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  sameSite?: string;
}

/**
 * Cookie is a type of `interface Storage`.
 * It is a wrapper around cookie management.
 */
class Cookie {
  public readonly enabled: boolean;
  private readonly debug: Debugger;
  private _options: CookieOptions;

  constructor(options?: CookieOptions) {
    this._options = options ?? DEFAULTS;
    this.enabled = options?.enabled ?? true;
    this.debug = d('analytics.js:cookie');
  }

  /**
   * Sets the options for the cookie.
   *
   * @param {CookieOptions} options - A collection of options for the cookie.
   */
  public set options(options: CookieOptions) {
    let domain = '.' + topDomain(window.location.href);
    if (domain === '.') domain = null;

    this._options = {
      ...DEFAULTS,
      domain: domain,
      ...options
    };

    // http://curl.haxx.se/rfc/cookie_spec.html
    // https://publicsuffix.org/list/effective_tld_names.dat
    //
    // try setting a dummy cookie with the options
    // if the cookie isn't set, it probably means
    // that the domain is on the public suffix list
    // like myapp.herokuapp.com or localhost / ip.
    this.set('ajs:test', true);
    if (!this.get('ajs:test')) {
      this.debug('fallback to domain=null');
      this._options.domain = null;
    }
    this.remove('ajs:test');
  }

  /**
   * Gets the current options for the cookie.
   *
   * @return {CookieOptions}
   */
  public get options(): CookieOptions {
    return this._options;
  }

  /**
   * Sets a value for a given key in the cookie.
   *
   * @param {string} key - The key for the value.
   * @param {Record<string | unknown>| string | boolean} value - The value for the given key.
   *
   * @return {boolean}
   */
  public set(
    key: string,
    value?: Record<string, unknown> | string | boolean
  ): boolean {
    try {
      value = window.JSON.stringify(value);
      cookie(key, value === 'null' ? null : value, cloneDeep(this._options));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Gets a value for a given key from the cookie.
   *
   * @param {string} key - The key holding the value.
   *
   * @return {object}
   */
  public get(key: string): Record<string, unknown> | string | null {
    try {
      let value: string | undefined = cookie(key);
      value = window.JSON.parse(value ?? null);
      return value;
    } catch (e) {
      return null;
    }
  }

  /**
   * Remove a value from our cookie by `key`.
   *
   * @param {string} key -  The key for the value to be removed.
   *
   * @return {boolean}
   */
  public remove(key: string): boolean {
    try {
      cookie(key, null, cloneDeep(this._options));
      return true;
    } catch (e) {
      return false;
    }
  }
}

export default new Cookie();

export { Cookie };
