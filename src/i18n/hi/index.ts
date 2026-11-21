import type { Messages } from '../index'

/** Every file of this language, in one download; not the kirana areas (./kirana.ts, only with the kirana switch on). */
const files = import.meta.glob<Record<string, unknown>>(['./*.json', '!./kirana*.json'], { eager: true, import: 'default' })

const messages: Messages = {}
for (const [path, content] of Object.entries(files)) {
  messages[path.slice(2, -5)] = content as Messages[string]
}
export default messages
