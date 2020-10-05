export interface StoreOptions {
  enabled?: boolean;
}

/**
 * Store is a type of `interface Storage`.
 * It is a small wrapper around `window.localStorage` that supports
 * serializing and deserializing `Record<string, unknown>` values as opposed to just `string` values.
 */
class Store {
  public enabled: boolean;
  private _options: StoreOptions;
  private store: Storage;

  constructor(options?: StoreOptions) {
    this._options = options ?? {};
    this.enabled = options?.enabled ?? true;
    this.store = localStorage;
  }

  /**
   * Set the `options` for the store
   * @param {StoreOptions} options - A collection of settings for this store.
   */
  public set options(options: StoreOptions) {
    if (arguments.length === 0) return;

    options = {
      enabled: true,
      ...(options || {})
    };

    this.enabled = options.enabled;
    this._options = options;
  }

  /**
   * Returns the options for the store.
   */
  public get options(): StoreOptions {
    return this._options;
  }

  /**
   * Set a `key` and `value` in localStorage.
   * @param {string} key - The key to store the value.
   * @param {string} value - the value to store at the given key.
   * @return {void}
   */
  public set(key: string, value: string | Record<string, unknown>): boolean {
    if (!this.enabled) return false;

    if (typeof value === 'string') {
      this.store.setItem(key, value);
      return true;
    }

    if (typeof value === 'object') {
      const d = window.JSON.stringify(value);
      this.store.setItem(key, d);
      return true;
    }

    return false;
  }

  /**
   * Get a value from local storage by `key`.
   * @param {string} key - The key holding the value.
   * @return {string | object} - The value for the key.
   */
  public get(key: string): string | Record<string, unknown> | undefined {
    if (!this.enabled) return;
    const item = this.store.getItem(key);

    if (!item) {
      return;
    }

    try {
      return window.JSON.parse(item);
    } catch {
      return item;
    }
  }

  /**
   * Remove a value from local storage by `key`.
   * @param {string} key - The key to remove
   * @Return {void}
   */
  public remove(key: string): void {
    if (!this.enabled) return;
    return this.store.removeItem(key);
  }
}

export default new Store();

export { Store };
