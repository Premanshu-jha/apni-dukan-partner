import { api } from './client'
import type { HelpTicket } from './types'

/** "Need help": a support ticket from this partner (owner, helper or barber); support sees their salon with it. */
export const helpApi = {
  ask: (message: string, subject?: string) =>
    api<HelpTicket>('POST', '/api/v1/helpdesk/tickets', { body: { app: 'PARTNER', subject: subject?.trim() || null, message } }),
}
