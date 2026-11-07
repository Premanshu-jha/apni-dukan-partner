import type { ShopRole } from '../api/types'

/** What each role may do. The backend checks the same and has the final say. */
export function can(role: ShopRole) {
  const owner = role === 'OWNER'
  const ownerOrHelper = owner || role === 'HELPER'
  return {
    editSetup: owner,
    seeSetup: ownerOrHelper,
    startWithoutCode: ownerOrHelper,
    reassign: ownerOrHelper,
    cancel: ownerOrHelper,
    undoNoShow: ownerOrHelper,
    history: ownerOrHelper,
    pause: ownerOrHelper,
    closures: owner,
    leave: owner,
    team: owner,
    callCustomer: ownerOrHelper,
    leaveShop: !owner,
    // The backend refuses an owner (SHOP_OWNER): the shop is closed or handed over first
    deleteAccount: !owner,
  }
}
