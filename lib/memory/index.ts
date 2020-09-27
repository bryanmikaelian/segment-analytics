import cloneDeep from 'lodash.clonedeep'

var bindAll = require('bind-all');


/**
 * Memory is an in-memory data store.
 */
class Memory {
  private readonly store: Record<string, unknown>

  constructor() {
    this.store = {}
  }

  /**
   * Sets a value in memory.
   *
   * @param {string} key - the key for the value.
   * @param {unknown} value - the value for the given key.
   * @return {boolean}
   */
  public set<T = unknown>(key: string, value: T): boolean {
    this.store[key] = cloneDeep(value);
    return true;
  }

  /**
   * Gets a value in memory for a given key.
   *
   * @param {string} key - the key for the value.
   * @return {boolean}
   */
  public get<T = unknown>(key: string): T | undefined {
    const value = this.store[key] as T

    if (!value) {
      return
    }

    return cloneDeep(value);
  }


  /**
   * Removes a value from memory for a given key.
   * @param {string} key - The key for the value to remove.
   *
   * @return {boolean}
   */
  public remove(key: string): boolean {
    delete this.store[key]
    return true
  }
}

export default new Memory()