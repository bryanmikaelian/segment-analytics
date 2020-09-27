export interface StoreOptions {
  enabled?: boolean;
  [key: string]: unknown
}

/**
 * Index is a small wrapper around `Storage` with the option to enable or disable the store.
 * Also supports serializing and deserializing `Record<string, unknown>` values as opposed to just `string` values.
 */
class Index {
  public enabled: boolean;
  private _options: StoreOptions;
  private store: Storage


  constructor(options?: StoreOptions) {
    this._options = options;
    this.store = localStorage
  }

  /**
   * Set the `options` for the store
   * @param {StoreOptions} options - A collection of settings for this store.
   */
  public set options(options: StoreOptions) {
    if (arguments.length === 0) return;

    options = {
      enabled: true,
      ...options || {}
    };

    this.enabled = options.enabled;
    this._options = options;
  }

  /**
   * Returns the options for the store.
   */
  public get options(): StoreOptions {
    return this._options
  }

  /**
   * Set a `key` and `value` in localStorage.
   * @param {string} key - The key to store the value.
   * @param {string} value - the value to store at the given key.
   * @return {void}
   */
  public set(key: string, value: string | Record<string, unknown>): void {
    if (!this.enabled) return;

    if (typeof value === 'string') {
      return this.store.setItem(key, value);
    }

    if (typeof value === 'object') {
      const d = JSON.stringify(value)
      return this.store.setItem(key, d)
    }
  }

  /**
   * Get a value from local storage by `key`.
   * @param {string} key - The key holding the value.
   * @return {string | object} - The value for the key.
   */
  public get(key: string): string | Record<string, unknown> {
    if (!this.enabled) return null;
    const item = this.store.getItem(key)

    if (!item) {
      return
    }

    try {
      return JSON.parse(item)
    } catch {
      return item
    }
  }

  /**
   * Remove a value from local storage by `key`.
   * @param {string} key - The key to remove
   * @Return {void}
   */
  public remove(key: string): void {
    if (!this.enabled) return;
    return this.store.removeItem(key)
  }
}

export default new Index();

export {
  Index
};

