import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useShop, useShopInvites } from '../../api/shop'
import type { ShopMember } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet } from '../../components/ui'
import { t, useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { UpiIdForm } from '../shop/KiranaRegister'

/**
 * A kirana's team: the owner and his helpers (they bill, scan and take khata payments; the owner's rules hold). The
 * owner invites a helper by phone: nobody joins until they accept in the app. Waiting invitations can be cancelled, and
 * a helper removed (signed out of the shop at once). Owner only.
 */
export function KiranaTeam() {
  const t = useT()
  const qc = useQueryClient()
  const members = useQuery({ queryKey: shopKeys.members, queryFn: shopApi.members })
  const invites = useShopInvites()
  const shop = useShop()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ShopMember | null>(null)
  const normalized = normalizePhone(phone)

  async function act(id: string, call: () => Promise<unknown>, after?: () => void) {
    setBusy(id)
    setError(null)
    setSent(null)
    try {
      await call()
      after?.()
    } catch (e) {
      // The backend's reason for the number, in the person's language: a whole sentence on its own; a short one
      // ("is your own number") after the field's own words, as everywhere else
      const phoneProblem = fieldError(e, 'phone')
      const raw = isApiError(e) ? e.details.phone : undefined
      setError(phoneProblem ? (typeof raw === 'string' && /^[a-z]/.test(raw) ? `${t('field.phone')} ${phoneProblem}.` : phoneProblem) : messageOf(e))
    } finally {
      setBusy(null)
      await Promise.all([qc.invalidateQueries({ queryKey: shopKeys.members }), qc.invalidateQueries({ queryKey: shopKeys.invites })])
    }
  }

  const waiting = (invites.data ?? []).filter((v) => v.role === 'HELPER')
  return (
    <Page back="/more" title={t('kiranaProducts.teamTitle')}>
      {members.isPending ? (
        <Loading />
      ) : members.isError && !members.data ? (
        <ErrorState message={messageOf(members.error)} onRetry={() => members.refetch()} />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.data.map((m) => (
            <li key={m.userId}>
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{m.name || t('kiranaProducts.teamNoName')}</p>
                  <p className="text-sm text-muted">
                    {m.role === 'OWNER' ? t('kiranaProducts.teamOwner') : t('kiranaProducts.teamHelper')}
                    {m.phone && ` · +91 ${formatPhone(m.phone)}`}
                  </p>
                </div>
                {m.role === 'HELPER' && (
                  <Button variant="ghost" className="text-bad" disabled={busy !== null} onClick={() => setRemoving(m)}>
                    {t('common.remove')}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="waiting" className="flex flex-col gap-2">
          <h2 id="waiting" className="font-semibold">
            {t('kiranaProducts.teamInvitesWaiting')}
          </h2>
          {waiting.map((v) => (
            <Card key={v.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p>+91 {formatPhone(v.phone)}</p>
                <p className="text-muted">{t('kiranaProducts.teamInviteUntil', { time: dateTimeIst(v.expiresAt) })}</p>
                <a href={inviteMessage(v.phone, shop.name)} target="_blank" rel="noreferrer" className="text-link underline">
                  {t('kiranaProducts.teamTellOnWhatsApp')}
                </a>
              </div>
              <Button variant="ghost" busy={busy === v.id} onClick={() => void act(v.id, () => shopApi.cancelInvite(v.id))}>
                {t('common.cancel')}
              </Button>
            </Card>
          ))}
        </section>
      )}

      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{t('kiranaProducts.teamInviteHelper')}</p>
        <p className="text-sm text-muted">{t('kiranaProducts.teamInviteHelp')}</p>
        <Field id="helper-phone" label={t('kiranaProducts.teamPhoneLabel')} inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
        {sent && <Banner tone="good">{sent}</Banner>}
        {error && removing === null && <Banner tone="bad">{error}</Banner>}
        <Button
          busy={busy === 'invite'}
          disabled={!normalized}
          onClick={() =>
            void act('invite', () => shopApi.addHelper(normalized!), () => {
              setSent(t('kiranaProducts.teamInviteSent', { phone: formatPhone(normalized!) }))
              setPhone('')
            })
          }
        >
          {t('kiranaProducts.teamSendInvite')}
        </Button>
      </Card>

      <Sheet
        open={removing !== null}
        title={removing?.name ? t('kiranaProducts.teamRemoveNamed', { name: removing.name }) : t('kiranaProducts.teamRemoveThisHelper')}
        onClose={() => {
          setRemoving(null)
          setError(null)
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-muted">{removing?.name ? t('kiranaProducts.teamRemoveNamedBody', { name: removing.name }) : t('kiranaProducts.teamRemoveTheyBody')}</p>
          {error && busy === null && <Banner tone="bad">{error}</Banner>}
          <Button
            variant="danger"
            busy={busy === 'remove'}
            onClick={() => removing && void act('remove', () => shopApi.removeHelper(removing.userId), () => setRemoving(null))}
          >
            {t('common.remove')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRemoving(null)
              setError(null)
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

/** The shop's UPI ID after registration (owner; the route wraps it in EditGate: a verified shop asks for the code). */
export function KiranaUpi() {
  const t = useT()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  return (
    <Page back="/more" title={t('kiranaProducts.upiTitle')}>
      {saved && <Banner tone="good">{t('kiranaProducts.upiSaved')}</Banner>}
      <UpiIdForm saveLabel={t('common.save')} onSaved={() => setSaved(true)} />
      <Button variant="ghost" onClick={() => navigate('/kirana/counter')}>
        {t('kiranaProducts.backToCounter')}
      </Button>
    </Page>
  )
}

/** A WhatsApp message to the person invited: where to open the app, the number to sign in with, and to accept. */
function inviteMessage(phone: string, shopName: string): string {
  const text = t('kiranaProducts.teamInviteMessage', { shop: shopName, url: window.location.origin, phone: formatPhone(phone) })
  return `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`
}
