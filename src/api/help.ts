import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { HelpTicket, MyRequest, MyRequestDetail } from './types'

export const helpKeys = {
  mine: ['help', 'mine'] as const,
  one: (id: string) => ['help', 'one', id] as const,
}

/** "Need help": a support ticket from this partner (owner, helper or barber); support sees their salon with it. */
export const helpApi = {
  ask: (message: string, subject?: string, fileIds: string[] = []) =>
    api<HelpTicket>('POST', '/api/v1/helpdesk/tickets', { body: { app: 'PARTNER', subject: subject?.trim() || null, message, fileIds } }),
  /** My requests, newest activity first (the latest 30). */
  mine: () => api<MyRequest[]>('GET', '/api/v1/helpdesk/tickets'),
  /** One of my requests with its messages. 404 when it isn't mine. */
  one: (id: string) => api<MyRequestDetail>('GET', `/api/v1/helpdesk/tickets/${encodeURIComponent(id)}`),
  /**
   * Adds to my request (2 to 5,000 characters, or none with files); it goes back to support, reopened if resolved.
   * 429 TOO_MANY_MESSAGES; 400 FILE_NOT_FOUND / 409 FILE_ALREADY_SENT for a file that must be added again.
   */
  add: (id: string, message: string, fileIds: string[] = []) =>
    api<MyRequestDetail>('POST', `/api/v1/helpdesk/tickets/${encodeURIComponent(id)}/messages`, { body: { message, fileIds } }),
}

export function useMyRequests() {
  return useQuery({ queryKey: helpKeys.mine, queryFn: helpApi.mine })
}

/**
 * Re-read every 30 s while open and not resolved, so support's reply shows without leaving the page. A resolved one
 * isn't polled (thousands of open pages would otherwise keep asking); it is read again when you come back to the tab.
 * A tab in the background never polls.
 */
export function useMyRequest(id: string) {
  return useQuery({
    queryKey: helpKeys.one(id),
    queryFn: () => helpApi.one(id),
    refetchInterval: (q) => (q.state.data?.ticket.status === 'RESOLVED' ? false : 30_000),
    refetchIntervalInBackground: false,
  })
}

export function useAddToRequest(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ message, fileIds }: { message: string; fileIds: string[] }) => helpApi.add(id, message, fileIds),
    // A 30 s re-read started before the send must not land after it and hide the message just sent
    onMutate: () => qc.cancelQueries({ queryKey: helpKeys.one(id) }),
    onSuccess: (detail) => {
      void qc.cancelQueries({ queryKey: helpKeys.one(id) })
      qc.setQueryData(helpKeys.one(id), detail)
      void qc.invalidateQueries({ queryKey: helpKeys.mine })
    },
  })
}
