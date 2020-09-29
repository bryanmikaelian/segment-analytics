import debug from 'debug';

import { Cookie } from './cookie';
import { Store as LocalStorage } from './local';
import { Memory } from './memory';
import { EntityOptions } from '../index';
import {
  ANONYMOUS_USER_ID_KEY,
  GROUP_ID_COOKIE_KEY,
  GROUP_TRAITS_LS_KEY,
  USER_ID_COOKIE_KEY,
  USER_ID_LS_KEY,
  USER_TRAITS_LS_KEY
} from '../keys';

/**
 * An interface that represents some entity that can get, set, and remove data.
 */
export interface EntityStore {
  enabled?: boolean;
  get: (key: string) => Record<string, unknown> | string | null;
  set: (
    key: string,
    value?: Record<string, unknown> | string | boolean
  ) => boolean;
  remove: (key: string) => void;
}

/**
 * Store is a strategy pattern-based class that determines which store to read and write from, depending on the key
 */
class Store implements EntityStore {
  private readonly localStore: EntityStore;
  private readonly memoryStore: EntityStore;
  private readonly cookieStore: EntityStore;

  constructor(options: EntityOptions, useLocalStorage = true) {
    this.memoryStore = new Memory();
    this.localStore = new LocalStorage({ enabled: useLocalStorage });
    this.cookieStore = new Cookie({ enabled: false });

    // Use cookies if they are enabled.
    // TODO: This is a dirty.  We should use a more standardized approach
    this.cookieStore.set('ajs:cookies', true);
    if (this.cookieStore.get('ajs:cookies')) {
      this.cookieStore.remove('ajs:cookies');
      this.cookieStore.enabled = true;
    }

    // fallback to memory storage.
    if (!this.cookieStore.enabled && !useLocalStorage) {
      debug('analytics:store')(
        'warning using memory store both cookies and localStorage are disabled'
      );
    }
  }

  get(key: string): Record<string, unknown> | string | null {
    let value = this.getPrimaryStoreForKey(key).get(key);

    if (value) {
      return value;
    }

    if (this.localStore.enabled) {
      // Check local storage for `user.id`, `group.id` or `user.anonymousId` since it gets replicated
      value = this.localStore.get(key);
    }

    return value;
  }

  remove(key: string): void {
    this.getPrimaryStoreForKey(key).remove(key);

    if (this.localStore.enabled) {
      this.localStore.remove(key);
    }
  }

  set(
    key: string,
    value: Record<string, unknown> | string | boolean | undefined
  ): boolean {
    // Anonymous ID, `user.id` and `group.id`, always gets replicated to local storage (if enabled)
    const replicate =
      key !== USER_TRAITS_LS_KEY &&
      key !== GROUP_TRAITS_LS_KEY &&
      this.localStore.enabled;

    if (!replicate) {
      return this.getPrimaryStoreForKey(key).set(key, value);
    }

    return (
      this.getPrimaryStoreForKey(key).set(key, value) &&
      this.localStore.set(key, value)
    );
  }

  private getPrimaryStoreForKey(key: string): EntityStore {
    switch (key) {
      case USER_ID_COOKIE_KEY:
      case GROUP_ID_COOKIE_KEY:
        if (this.cookieStore.enabled) {
          return this.cookieStore;
        }

        if (this.localStore.enabled) {
          return this.localStore;
        }

        return this.memoryStore;
      case USER_TRAITS_LS_KEY:
      case GROUP_TRAITS_LS_KEY:
        if (this.localStore.enabled) {
          return this.localStore;
        }

        return this.memoryStore;
      case ANONYMOUS_USER_ID_KEY:
        return this.cookieStore;
      default:
        return this.memoryStore;
    }
  }
}

export { Store };
