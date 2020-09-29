import Entity, { EntityOptions } from '.';
import { default as d } from 'debug';

import rawCookie from '@segment/cookie';
import uuid from 'uuid';
import {
  ANONYMOUS_USER_ID_KEY,
  USER_ID_COOKIE_KEY,
  USER_ID_LEGACY_COOKIE_KEY,
  USER_TRAITS_LS_KEY
} from './keys';

class User extends Entity {
  private static defaults: EntityOptions = {
    persist: true,
    cookie: {
      key: USER_ID_COOKIE_KEY,
      oldKey: USER_ID_LEGACY_COOKIE_KEY
    },
    localStorage: {
      key: USER_TRAITS_LS_KEY
    }
  };

  constructor(options: Partial<EntityOptions> = {}) {
    super({
      ...User.defaults,
      ...options
    });
    this.debug = d('analytics:user');
  }

  /**
   * Set/get the user id.
   *
   * When the user id changes, the method will reset his anonymousId to a new one.
   *
   * @example
   * // didn't change because the user didn't have previous id.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * assert.equal(anonymousId, user.anonymousId());
   *
   * // didn't change because the user id changed to null.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * user.id(null);
   * assert.equal(anonymousId, user.anonymousId());
   *
   * // change because the user had previous id.
   * anonymousId = user.anonymousId();
   * user.id('foo');
   * user.id('baz'); // triggers change
   * user.id('baz'); // no change
   * assert.notEqual(anonymousId, user.anonymousId());
   */
  public set id(id: string) {
    const prev = super.id;
    super.id = id;

    if (!prev || !id) {
      return;
    }

    // FIXME: We're relying on coercion here (1 == "1"), but our API treats these
    // two values differently. Figure out what will break if we remove this and
    // change to strict equality
    /* eslint-disable eqeqeq */
    if (prev != id) {
      this.anonymousId(null);
    }
  }

  /**
   * Gets the current user's ID
   *
   * @return {string|undefined}
   */
  public get id(): string | undefined {
    return super.id;
  }

  /**
   * Set / get / remove anonymousId.  Will always replicate to localStorage, if enabled.
   *
   * @param {String} anonymousId
   * @return {String|User}
   */
  public anonymousId(anonymousId?: string): string {
    const { storage: store } = this;

    // set / remove
    if (arguments.length) {
      store.set(ANONYMOUS_USER_ID_KEY, anonymousId);
      return anonymousId;
    }

    // new
    anonymousId = store.get(ANONYMOUS_USER_ID_KEY) as string;
    if (anonymousId) {
      // refresh cookie to extend expiry
      // value exists in cookie, so this will also copy it to localStorage
      store.set(ANONYMOUS_USER_ID_KEY, anonymousId);
      return anonymousId;
    }

    // old - it is not stringified so we use the raw cookie.
    anonymousId = rawCookie('_sio');
    if (anonymousId) {
      anonymousId = anonymousId.split('----')[0];
      store.set(ANONYMOUS_USER_ID_KEY, anonymousId);
      store.remove('_sio');
      return anonymousId;
    }

    // empty
    anonymousId = uuid.v4();
    store.set(ANONYMOUS_USER_ID_KEY, anonymousId);
    return anonymousId;
  }

  /**
   * Remove anonymous id on logout too.
   */
  public logout(): void {
    super.logout();
    this.anonymousId(null);
    this.options = User.defaults;
  }

  /**
   * Load saved user `id` or `traits` from storage.
   */
  public load(): void {
    if (this._loadOldCookie()) return;
    super.load();
  }

  /**
   * BACKWARDS COMPATIBILITY: Load the old user from the cookie.
   *
   * @api private
   */
  private _loadOldCookie(): boolean {
    const user = this.storage.get(this._options.cookie.oldKey) as Record<
      string,
      unknown
    >;
    if (!user) return false;

    this.id = user.id as string;
    this.traits = user.traits as Record<string, unknown>;
    this.storage.remove(this._options.cookie.oldKey);
    return true;
  }
}

export default new User();
export { User };
