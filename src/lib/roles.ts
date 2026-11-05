import type { ShopRole, Staff } from '../api/types'
import { normalizePhone } from './phone'

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
  }
}

/** The staff profile this person signs in as (a barber), found by the phone the owner linked. */
export function myStaff(staff: Staff[] | undefined, phone: string | null | undefined): Staff | null {
  const me = phone ? normalizePhone(phone) : null
  if (!me || !staff) return null
  return staff.find((s) => s.loginPhone && normalizePhone(s.loginPhone) === me) ?? null
}
