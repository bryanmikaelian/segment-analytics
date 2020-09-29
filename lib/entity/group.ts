import { default as d } from 'debug';

import Entity, { EntityOptions } from './';
import { GROUP_ID_COOKIE_KEY, GROUP_TRAITS_LS_KEY } from './keys';

class Group extends Entity {
  private static defaults: EntityOptions = {
    persist: true,
    cookie: {
      key: GROUP_ID_COOKIE_KEY
    },
    localStorage: {
      key: GROUP_TRAITS_LS_KEY
    }
  };

  constructor(options: Partial<EntityOptions> = {}) {
    super({
      ...Group.defaults,
      ...options
    });
    this.debug = d('analytics:group');
  }

  public logout(): void {
    super.logout();
    this.options = Group.defaults;
  }
}

export default new Group();
export { Group };
