import { kiranaAreas } from '../kirana'

/** This language's kirana files, in one download fetched only with the kirana switch on (see ../kirana.ts). */
export default kiranaAreas(import.meta.glob('./kirana*.json', { eager: true, import: 'default' }))
