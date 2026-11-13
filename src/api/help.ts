import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { HelpTicket, MyRequest, MyRequestDetail } from './types'

export const helpKeys = {
  mine: ['help', 'mine'] as const,
  one: (id: string) => ['help', 'one', id] as const,
}

/** "Need help": a support ticket from this partner (owner, helper or barber); support sees their salon with it. */
export const helpApi = {
  ask: (message: string, subject?: string) =>
    api<HelpTicket>('POST', '/api/v1/helpdesk/tickets', { body: { app: 'PARTNER', subject: subject?.trim() || null, message } }),
  /** My requests, newest activity first (the latest 30). */
  mine: () => api<MyRequest[]>('GET', '/api/v1/helpdesk/tickets'),
  /** One of my requests with its messages. 404 when it isn't mine. */
  one: (id: string) => api<MyRequestDetail>('GET', `/api/v1/helpdesk/tickets/${encodeURIComponent(id)}`),
  /** Adds to my request (2 to 5,000 characters); it goes back to support, reopened if resolved. 429 TOO_MANY_MESSAGES. */
  add: (id: string, message: string) =>
    api<MyRequestDetail>('POST', `/api/v1/helpdesk/tickets/${encodeURIComponent(id)}/messages`, { body: { message } }),
}

export function useMyRequests() {
  return useQuery({ queryKey: helpKeys.mine, queryFn: helpApi.mine })
}

/** Re-read every 30 s while open, so support's reply shows without leaving the page. */
export function useMyRequest(id: string) {
  return useQuery({ queryKey: helpKeys.one(id), queryFn: () => helpApi.one(id), refetchInterval: 30_000 })
}

export function useAddToRequest(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => helpApi.add(id, message),
    // A 30 s re-read started before the send must not land after it and hide the message just sent
    onMutate: () => qc.cancelQueries({ queryKey: helpKeys.one(id) }),
    onSuccess: (detail) => {
      void qc.cancelQueries({ queryKey: helpKeys.one(id) })
      qc.setQueryData(helpKeys.one(id), detail)
      void qc.invalidateQueries({ queryKey: helpKeys.mine })
    },
  })
}
