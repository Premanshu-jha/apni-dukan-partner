import type { Messages } from '../index'

/** Every file of this language, in one download. */
const files = import.meta.glob<Record<string, unknown>>('./*.json', { eager: true, import: 'default' })

const messages: Messages = {}
for (const [path, content] of Object.entries(files)) {
  messages[path.slice(2, -5)] = content as Messages[string]
}
export default messages
