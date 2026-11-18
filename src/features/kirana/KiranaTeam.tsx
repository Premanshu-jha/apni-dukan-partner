import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { fieldError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useShop, useShopInvites } from '../../api/shop'
import type { ShopMember } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { UpiIdForm } from '../shop/KiranaRegister'

/**
 * A kirana's team: the owner and his helpers (they bill, scan and take khata payments; the owner's rules hold). The
 * owner invites a helper by phone: nobody joins until they accept in the app. Waiting invitations can be cancelled, and
 * a helper removed (signed out of the shop at once). Owner only.
 */
export function KiranaTeam() {
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
      const phoneProblem = fieldError(e, 'phone')
      setError(phoneProblem ? `That number ${phoneProblem}.` : messageOf(e))
    } finally {
      setBusy(null)
      await Promise.all([qc.invalidateQueries({ queryKey: shopKeys.members }), qc.invalidateQueries({ queryKey: shopKeys.invites })])
    }
  }

  const waiting = (invites.data ?? []).filter((v) => v.role === 'HELPER')
  return (
    <Page back="/more" title="Team">
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
                  <p className="font-semibold break-words">{m.name || 'No name yet'}</p>
                  <p className="text-sm text-muted">
                    {m.role === 'OWNER' ? 'Owner' : 'Helper'}
                    {m.phone && ` · +91 ${formatPhone(m.phone)}`}
                  </p>
                </div>
                {m.role === 'HELPER' && (
                  <Button variant="ghost" className="text-bad" disabled={busy !== null} onClick={() => setRemoving(m)}>
                    Remove
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
            Invitations waiting
          </h2>
          {waiting.map((v) => (
            <Card key={v.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p>+91 {formatPhone(v.phone)}</p>
                <p className="text-muted">Until {dateTimeIst(v.expiresAt)}</p>
                <a href={inviteMessage(v.phone, shop.name)} target="_blank" rel="noreferrer" className="text-link underline">
                  Tell them on WhatsApp
                </a>
              </div>
              <Button variant="ghost" busy={busy === v.id} onClick={() => void act(v.id, () => shopApi.cancelInvite(v.id))}>
                Cancel
              </Button>
            </Card>
          ))}
        </section>
      )}

      <Card className="flex flex-col gap-3">
        <p className="font-semibold">Invite a helper</p>
        <p className="text-sm text-muted">
          They sign in to Clozest Partner with this number and accept. Helpers bill at the counter, scan stock and take
          khata payments. Changing prices, limits and old bills stays with you.
        </p>
        <Field id="helper-phone" label="Their mobile number" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
        {sent && <Banner tone="good">{sent}</Banner>}
        {error && removing === null && <Banner tone="bad">{error}</Banner>}
        <Button
          busy={busy === 'invite'}
          disabled={!normalized}
          onClick={() =>
            void act('invite', () => shopApi.addHelper(normalized!), () => {
              setSent(`Invitation sent to +91 ${formatPhone(normalized!)}.`)
              setPhone('')
            })
          }
        >
          Send the invitation
        </Button>
      </Card>

      <Sheet
        open={removing !== null}
        title={`Remove ${removing?.name || 'this helper'}?`}
        onClose={() => {
          setRemoving(null)
          setError(null)
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-muted">{removing?.name || 'They'} will be signed out at once and can't open your shop any more. Their bills stay.</p>
          {error && busy === null && <Banner tone="bad">{error}</Banner>}
          <Button
            variant="danger"
            busy={busy === 'remove'}
            onClick={() => removing && void act('remove', () => shopApi.removeHelper(removing.userId), () => setRemoving(null))}
          >
            Remove
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRemoving(null)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

/** The shop's UPI ID after registration (owner; the route wraps it in EditGate: a verified shop asks for the code). */
export function KiranaUpi() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  return (
    <Page back="/more" title="UPI ID">
      {saved && <Banner tone="good">Saved. The counter's QR pays to it from the next bill.</Banner>}
      <UpiIdForm saveLabel="Save" onSaved={() => setSaved(true)} />
      <Button variant="ghost" onClick={() => navigate('/kirana/counter')}>
        Back to the counter
      </Button>
    </Page>
  )
}

/** A WhatsApp message to the person invited: where to open the app, the number to sign in with, and to accept. */
function inviteMessage(phone: string, shopName: string): string {
  const text = `${shopName} added you as a helper on Clozest Partner. Open ${window.location.origin}, sign in with +91 ${formatPhone(phone)} and accept the invitation.`
  return `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`
}
