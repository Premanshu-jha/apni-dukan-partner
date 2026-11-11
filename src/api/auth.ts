import { deviceName } from '../lib/device'
import { api } from './client'
import type { Tokens, User } from './types'

const A = '/api/v1/auth'

/** Where a phone change's second code went: the verified email, or (without one) the number the account has now. */
export interface PhoneChangeSent {
  secondCodeTo: 'EMAIL' | 'PHONE'
  /** Masked: "r***@gmail.com", "ending 2345". */
  sentTo: string
}

export const authApi = {
  sendCode: (phone: string, captchaToken: string | null) =>
    api<void>('POST', `${A}/otp/send`, { body: { phone, captchaToken }, auth: false }),
  verifyCode: (phone: string, code: string) =>
    api<Tokens>('POST', `${A}/otp/verify`, { body: { phone, code, device: deviceName() }, auth: false }),
  logout: (refreshToken: string) => api<void>('POST', `${A}/logout`, { body: { refreshToken }, auth: false }),
  logoutAll: () => api<void>('POST', `${A}/logout-all`),
  me: () => api<User>('GET', `${A}/me`),
  rename: (name: string) => api<User>('PATCH', `${A}/me`, { body: { name } }),
  /** phoneCode is needed only when replacing an email that is already verified. */
  sendEmailCode: (email: string, phoneCode?: string) =>
    api<void>('POST', `${A}/email/send-code`, { body: { email, phoneCode: phoneCode || null } }),
  verifyEmail: (email: string, code: string) => api<User>('POST', `${A}/email/verify`, { body: { email, code } }),
  /** Sends a code to the person's phone, needed before changing a verified email. */
  sendChangeEmailPhoneCode: () => api<void>('POST', `${A}/email/change-phone-code`),
  sendDeleteCode: () => api<void>('POST', `${A}/me/delete-code`),
  deleteAccount: (code: string) => api<void>('POST', `${A}/me/delete`, { body: { code } }),
  /** Changing the phone number: a code to the new number, and a second code (the answer says where it went). */
  sendPhoneChangeCode: (newPhone: string) => api<PhoneChangeSent>('POST', `${A}/me/phone/send-code`, { body: { newPhone } }),
  /** Both codes right: the account moves to the new number; every other device is signed out, this one gets new tokens. */
  changePhone: (newPhone: string, phoneCode: string, secondCode: string) =>
    api<Tokens>('POST', `${A}/me/phone`, { body: { newPhone, phoneCode, secondCode, device: deviceName() } }),
  startRecovery: (email: string, newPhone: string, captchaToken: string | null) =>
    api<void>('POST', `${A}/recover/start`, { body: { email, newPhone, captchaToken }, auth: false }),
  completeRecovery: (email: string, emailCode: string, newPhone: string, phoneCode: string) =>
    api<Tokens>('POST', `${A}/recover/complete`, {
      body: { email, emailCode, newPhone, phoneCode, device: deviceName() },
      auth: false,
    }),
}
