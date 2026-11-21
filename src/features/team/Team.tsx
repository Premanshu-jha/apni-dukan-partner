import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fieldError, messageOf } from '../../api/errors'
import { dayApi, forgetBarberInvite, salonKeys } from '../../api/salon'
import { shopApi, shopKeys, useShopInvites } from '../../api/shop'
import type { Member } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet, Switch } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { useLocation } from 'react-router'
import { unsavedWarning } from '../../lib/unsaved'
import { cameFrom } from '../shop/Register'

/** The words for each role: keys in the language files. */
const roleText = { OWNER: 'team.roleOwner', HELPER: 'team.roleHelper', BARBER: 'team.roleBarber' } as const

/**
 * Everyone who signs in to this salon. The owner invites helpers by phone (barbers are invited on their own page);
 * nobody joins until they accept. The invitations still waiting are listed with Cancel. The owner also chooses who
 * may add walk-ins. Owner only.
 */
export function Team() {
  const t = useT()
  const qc = useQueryClient()
  const members = useQuery({ queryKey: salonKeys.members, queryFn: dayApi.members })
  const invites = useShopInvites()
  const [sent, setSent] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const normalized = normalizePhone(phone)
  const location = useLocation()

  async function act(id: string, call: () => Promise<unknown>, after?: () => void) {
    setBusy(id)
    setError(null)
    setSent(null)
    try {
      await call()
      after?.()
    } catch (e) {
      // 400 VALIDATION_FAILED names the phone (the owner's own number); the rest are the backend's own words
      const phoneProblem = fieldError(e, 'phone')
      setError(phoneProblem ? t('team.phoneProblem', { problem: phoneProblem }) : messageOf(e))
    } finally {
      setBusy(null)
      await Promise.all([qc.invalidateQueries({ queryKey: salonKeys.members }), qc.invalidateQueries({ queryKey: shopKeys.invites })])
    }
  }

  return (
    // Back where it was opened from (Today's setup card), else More; a helper's number typed and not sent asks first
    <Page back={cameFrom(location, '/more')} title={t('team.title')} leaveWarning={unsavedWarning(phone.trim() !== '')}>
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState message={messageOf(members.error)} onRetry={() => members.refetch()} />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.data.map((m) => (
            <li key={m.userId}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.name || t('team.noName')}</p>
                    <p className="text-sm text-muted">
                      {t(roleText[m.role])} · +91 {formatPhone(m.phone)}
                    </p>
                  </div>
                  {m.role === 'HELPER' && (
                    <Button variant="ghost" className="text-bad" onClick={() => setRemoving(m)}>
                      {t('common.remove')}
                    </Button>
                  )}
                </div>
                {m.role !== 'OWNER' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{t('team.canAddWalkIns')}</span>
                    <Switch
                      label={m.name ? t('team.memberCanAddWalkIns', { name: m.name }) : t('team.unnamedCanAddWalkIns')}
                      checked={m.walkInAccess}
                      disabled={busy === m.userId}
                      onChange={(on) => act(m.userId, () => dayApi.setWalkInAccess(m.userId, on))}
                    />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {(invites.data?.length ?? 0) > 0 && (
        <section aria-label={t('team.invitesWaitingLabel')} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{t('team.waitingHeading')}</h2>
          <ul className="flex flex-col gap-2">
            {invites.data!.map((v) => (
              <li key={v.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">+91 {formatPhone(v.phone)}</p>
                    <p className="text-sm text-muted">
                      {v.role === 'HELPER' ? t('team.roleHelper') : t('team.roleBarber')} · {t('team.openUntil', { when: dateTimeIst(v.expiresAt) })}
                    </p>
                  </div>
                  {/* A barber's invitation shows on his page ("Invited: …"): refresh the barbers so it goes there too */}
                  <Button variant="secondary" busy={busy === v.id} onClick={() => act(v.id, () => shopApi.cancelInvite(v.id), v.staffId ? () => forgetBarberInvite(qc, v.staffId!) : undefined)}>
                    {t('team.cancelInvite')}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invites.isError && <Banner tone="warn">{t('team.invitesFailed', { reason: messageOf(invites.error) })}</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{t('team.inviteHelper')}</p>
        <p className="text-sm text-muted">
          {t('team.inviteHelperHint')}
        </p>
        <Field id="helper-phone" label={t('team.helperMobile')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button
          busy={busy === 'add'}
          disabled={!normalized}
          onClick={() =>
            act('add', async () => {
              await shopApi.addHelper(normalized!)
              setPhone('')
              setSent('team.invitationSent')
            })
          }
        >
          {t('team.sendInvitation')}
        </Button>
        {sent && <Banner tone="good">{t(sent)}</Banner>}
      </Card>
      <Sheet open={removing !== null} title={t('team.removeHelperTitle')} onClose={() => setRemoving(null)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{removing?.name ? t('team.removedNamed', { name: removing.name }) : t('team.removedUnnamed')}</p>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button
            variant="danger"
            busy={busy === removing?.userId}
            onClick={() => removing && act(removing.userId, () => shopApi.removeHelper(removing.userId), () => setRemoving(null))}
          >
            {t('common.remove')}
          </Button>
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}
