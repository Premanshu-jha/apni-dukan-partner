/**
 * The pictures shown next to a salon service (the backend's ServiceIcon names) and which of them fit a service's
 * name. The same file is in the partner and customer apps.
 *
 * Drawings: thin-line SVG on a 24×24 grid. Most are from Lucide (https://lucide.dev, ISC licence: "Copyright (c)
 * Lucide Icons and Contributors; permission to use, copy, modify and distribute is granted"); the salon-only ones
 * (marked below) are drawn for Clozest in the same style (stroke 2, round ends).
 */

export const SERVICE_ICONS = [
  'HAIRCUT', 'BEARD', 'SHAVE', 'HAIR_COLOUR', 'STYLING', 'HAIR_SPA', 'HAIR_WASH', 'FACIAL', 'CLEANUP', 'MASSAGE',
  'THREADING', 'WAXING', 'MANICURE', 'PEDICURE', 'MAKEUP', 'BRIDAL', 'KIDS', 'MEHENDI', 'STRAIGHTENING', 'CURLS',
  'NAIL_ART', 'EYELASH', 'BODY_SPA', 'PIERCING', 'PACKAGE', 'OTHER',
] as const
export type ServiceIconName = (typeof SERVICE_ICONS)[number]

/** One SVG element: its tag and attributes. */
export type IconNode = [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string>]

export const ICON_DRAWINGS: Record<ServiceIconName, IconNode[]> = {
  // Lucide "scissors"
  HAIRCUT: [
    ['circle', { cx: '6', cy: '6', r: '3' }],
    ['path', { d: 'M8.12 8.12 12 12' }],
    ['path', { d: 'M20 4 8.12 15.88' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
    ['path', { d: 'M14.8 14.8 20 20' }],
  ],
  // A curled moustache (the barber's sign for beard work)
  BEARD: [
    ['path', { d: 'M12 11C10.3 8.2 7.2 7.6 5.3 9.3 3.9 10.6 3.4 13 1.8 12.6c-.9-.3-.8-1.7.2-2' }],
    ['path', { d: 'M1.8 12.6C3 15.6 6.6 16.8 9.2 15.4 10.4 14.8 11.3 13.9 12 13c.7.9 1.6 1.8 2.8 2.4 2.6 1.4 6.2.2 7.4-2.8' }],
    ['path', { d: 'M12 11c1.7-2.8 4.8-3.4 6.7-1.7 1.4 1.3 1.9 3.7 3.5 3.3.9-.3.8-1.7-.2-2' }],
  ],
  // A safety razor
  SHAVE: [
    ['rect', { x: '5', y: '3', width: '14', height: '5', rx: '1.5' }],
    ['path', { d: 'M8 5.5h8' }],
    ['path', { d: 'M12 8v3' }],
    ['path', { d: 'M10.5 11h3l-.5 10h-2z' }],
  ],
  // Lucide "palette"
  HAIR_COLOUR: [
    ['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }],
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  // A hair dryer blowing air
  STYLING: [
    ['path', { d: 'M3 9a5 5 0 0 1 5-5h7l3 1.5v7L15 14H8a5 5 0 0 1-5-5z' }],
    ['circle', { cx: '8', cy: '9', r: '1.5' }],
    ['path', { d: 'M10 14l-1.5 6.5a1 1 0 0 0 1 1.5h1.5a1 1 0 0 0 1-.8L13 14' }],
    ['path', { d: 'M21 7v4' }],
  ],
  // Lucide "soap-dispenser-droplet"
  HAIR_SPA: [
    ['path', { d: 'M10.5 2v4' }],
    ['path', { d: 'M14 2H7a2 2 0 0 0-2 2' }],
    ['path', { d: 'M19.29 14.76A6.67 6.67 0 0 1 17 11a6.6 6.6 0 0 1-2.29 3.76c-1.15.92-1.71 2.04-1.71 3.19 0 2.22 1.8 4.05 4 4.05s4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19' }],
    ['path', { d: 'M9.607 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h7V7a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3' }],
  ],
  // Lucide "shower-head"
  HAIR_WASH: [
    ['path', { d: 'm4 4 2.5 2.5' }],
    ['path', { d: 'M13.5 6.5a4.95 4.95 0 0 0-7 7' }],
    ['path', { d: 'M15 5 5 15' }],
    ['path', { d: 'M14 17v.01' }],
    ['path', { d: 'M10 16v.01' }],
    ['path', { d: 'M13 13v.01' }],
    ['path', { d: 'M16 10v.01' }],
    ['path', { d: 'M11 20v.01' }],
    ['path', { d: 'M17 14v.01' }],
    ['path', { d: 'M20 11v.01' }],
  ],
  // Lucide "smile"
  FACIAL: [
    ['path', { d: 'M15 10V9' }],
    ['path', { d: 'M16.472 15a6 6 0 01-8.943 0' }],
    ['path', { d: 'M9 10V9' }],
    ['circle', { cx: '12', cy: '12', r: '10' }],
  ],
  // Lucide "sparkles"
  CLEANUP: [
    ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: '4', cy: '20', r: '2' }],
  ],
  // Lucide "hand-heart"
  MASSAGE: [
    ['path', { d: 'M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16' }],
    ['path', { d: 'm14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95' }],
    ['path', { d: 'm2 15 6 6' }],
    ['path', { d: 'm7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91' }],
  ],
  // An eyebrow above an eye, and the twisted thread
  THREADING: [
    ['path', { d: 'M3 8c3-3 8-3.5 13-1.5' }],
    ['path', { d: 'M3 14s3-4 8-4 8 4 8 4-3 4-8 4-8-4-8-4z' }],
    ['circle', { cx: '11', cy: '14', r: '1.5' }],
    ['path', { d: 'M18 3l3 3' }],
    ['path', { d: 'M21 3l-3 3' }],
  ],
  // A wax strip being pulled away
  WAXING: [
    ['path', { d: 'M3 17h10' }],
    ['path', { d: 'M13 17c3 0 5-2 6-5' }],
    ['path', { d: 'M8 14l9-9a1.4 1.4 0 0 1 2 2l-9 9' }],
    ['path', { d: 'M11 11l2 2' }],
    ['path', { d: 'M14 8l2 2' }],
  ],
  // Lucide "hand"
  MANICURE: [
    ['path', { d: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2' }],
    ['path', { d: 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2' }],
    ['path', { d: 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8' }],
    ['path', { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }],
  ],
  // Lucide "footprints"
  PEDICURE: [
    ['path', { d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z' }],
    ['path', { d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z' }],
    ['path', { d: 'M16 17h4' }],
    ['path', { d: 'M4 13h4' }],
  ],
  // A lipstick
  MAKEUP: [
    ['path', { d: 'M9.5 11V6.5l5-3.5v8' }],
    ['rect', { x: '8.5', y: '11', width: '7', height: '3', rx: '.5' }],
    ['rect', { x: '8', y: '14', width: '8', height: '8', rx: '1' }],
  ],
  // Lucide "crown"
  BRIDAL: [
    ['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z' }],
    ['path', { d: 'M5 21h14' }],
  ],
  // Lucide "baby"
  KIDS: [
    ['path', { d: 'M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5' }],
    ['path', { d: 'M15 12h.01' }],
    ['path', { d: 'M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1' }],
    ['path', { d: 'M9 12h.01' }],
  ],
  // A henna cone drawing its line
  MEHENDI: [
    ['path', { d: 'M14 3l7 7-9.5 4.5L9.5 12z' }],
    ['path', { d: 'M9.5 12l-1.2 1.2a1.4 1.4 0 0 0 0 2l.5.5a1.4 1.4 0 0 0 2 0L12 14.5' }],
    ['path', { d: 'M8 16c-2 1-3 2.5-2.5 4 .4 1.2 2 1.2 2.8.3.9-1-.6-2.3-2-1.6-1.4.7-2.2 1.5-3.3 1.3' }],
  ],
  // A flat iron (hair straightener)
  STRAIGHTENING: [
    ['path', { d: 'M5 21l4-12' }],
    ['path', { d: 'M9 21l2-12' }],
    ['rect', { x: '7.5', y: '3', width: '5', height: '6', rx: '1' }],
    ['path', { d: 'M15 6c2.5 1 3.5 3 3.5 6s-1 5-3.5 6' }],
    ['path', { d: 'M17.5 9c1.5.5 2.5 1.5 2.5 3s-1 2.5-2.5 3' }],
  ],
  // A curl of hair
  CURLS: [
    ['path', { d: 'M12 3c-4 0-7 3-7 6.5S7.5 15 10.5 15s4.5-2 4.5-4-1.5-3.5-3.5-3.5S8.5 9 9 10.5' }],
    ['path', { d: 'M15 11c2 1 4 3 4 5.5S17 21 14 21s-5-1.5-5-3.5' }],
  ],
  // A bottle of nail polish
  NAIL_ART: [
    ['rect', { x: '6', y: '11', width: '12', height: '10', rx: '2.5' }],
    ['path', { d: 'M9 11V8h6v3' }],
    ['path', { d: 'M10 8V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V8' }],
    ['path', { d: 'M9 15h6' }],
  ],
  // A closed eye with long lashes
  EYELASH: [
    ['path', { d: 'M3 10c2.5 3 5.5 4.5 9 4.5s6.5-1.5 9-4.5' }],
    ['path', { d: 'M12 14.5V18' }],
    ['path', { d: 'M7.5 13l-1.8 3' }],
    ['path', { d: 'M16.5 13l1.8 3' }],
    ['path', { d: 'M4.5 11.5L2.5 14' }],
    ['path', { d: 'M19.5 11.5l2 2.5' }],
  ],
  // A lotus: spa and body care
  BODY_SPA: [
    ['path', { d: 'M12 20c-3-2-4.5-5-4.5-8.5 0-2.5 1.5-5 4.5-7.5 3 2.5 4.5 5 4.5 7.5S15 18 12 20z' }],
    ['path', { d: 'M12 20c-3.5 0-6.5-1.5-8.5-4.5 1-1.5 2.5-2.5 4.3-3' }],
    ['path', { d: 'M12 20c3.5 0 6.5-1.5 8.5-4.5-1-1.5-2.5-2.5-4.3-3' }],
  ],
  // An ear with a stud
  PIERCING: [
    ['path', { d: 'M6 8.5a6 6 0 0 1 12 0c0 2.5-1.5 3.8-2.8 5-1.2 1.1-1.7 2-1.7 3.5a3.5 3.5 0 0 1-7 0' }],
    ['path', { d: 'M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5' }],
    ['circle', { cx: '9', cy: '18.5', r: '1', fill: 'currentColor' }],
  ],
  // Lucide "gift": a package or combo of services
  PACKAGE: [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8' }],
    ['path', { d: 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5' }],
    ['rect', { x: '3', y: '7', width: '18', height: '4', rx: '1' }],
  ],
  // A barber's pole: any salon service
  OTHER: [
    ['path', { d: 'M7 3h10' }],
    ['path', { d: 'M7 21h10' }],
    ['rect', { x: '8', y: '5', width: '8', height: '14', rx: '2' }],
    ['path', { d: 'M8 10.5l8-3.5' }],
    ['path', { d: 'M8 15l8-3.5' }],
    ['path', { d: 'M9.5 19l6.5-3' }],
  ],
}

/** What each picture is for, as the picker names it (the service, not the drawing). */
export const ICON_LABELS: Record<ServiceIconName, string> = {
  HAIRCUT: 'Haircut', BEARD: 'Beard', SHAVE: 'Shave', HAIR_COLOUR: 'Hair colour', STYLING: 'Styling',
  HAIR_SPA: 'Spa', HAIR_WASH: 'Hair wash', FACIAL: 'Facial', CLEANUP: 'Clean-up', MASSAGE: 'Massage',
  THREADING: 'Threading', WAXING: 'Waxing', MANICURE: 'Manicure', PEDICURE: 'Pedicure', MAKEUP: 'Make-up',
  BRIDAL: 'Bridal', KIDS: 'Kids', MEHENDI: 'Mehendi', STRAIGHTENING: 'Straightening', CURLS: 'Curls',
  NAIL_ART: 'Nail art', EYELASH: 'Eyelashes', BODY_SPA: 'Body spa', PIERCING: 'Piercing', PACKAGE: 'Package',
  OTHER: 'General (barber pole)',
}

/**
 * Words in a service's name that say which icons fit it, any case, in English, in Hindi as salons write it in
 * English letters, and in Devanagari. A plain keyword also matches the start of a longer word (4 letters or more:
 * "facials") or a word holding it (5 or more: "beardtrim"). "=word" matches only that whole word ("baby" but not
 * "babylights", "perm" but not "permanent"). "~word" is a weak hint: it fits, but any other word in the name goes
 * before it ("Spa pedicure" is a pedicure first, "Oil massage" a massage, "Boy cut" a haircut). On a tie, the order
 * below decides (a "Gel nails" is nail art before a styling gel).
 */
const KEYWORDS: [ServiceIconName, string[]][] = [
  ['PACKAGE', ['package', 'packages', 'combo', 'combos', 'deal', 'membership', 'पैकेज']],
  ['BRIDAL', ['bridal', 'bride', '=groom', 'wedding', 'dulha', 'dulhan', 'shaadi', 'engagement', 'reception', 'दुल्हन', 'दूल्हा', 'शादी']],
  ['KIDS', ['=kid', 'kids', 'child', 'children', '=baby', '~boy', '~boys', '~girl', '~girls', 'bachcha', 'mundan', 'बच्चा', 'बच्चे', 'मुंडन']],
  ['BEARD', ['beard', 'moustache', 'mustache', 'goatee', 'dadhi', 'daadhi', 'stubble', 'दाढ़ी', 'दाढी', 'मूंछ']],
  ['SHAVE', ['shave', 'shaving', 'razor', 'शेव', 'शेविंग']],
  ['HAIRCUT', ['haircut', 'cut', 'cutting', 'crop', 'fade', 'skinfade', 'trim', 'trimming', 'bob', 'layer', 'layers', 'undercut', 'boycut', 'baal', 'कटिंग', 'कट', 'हेयरकट', '~बाल']],
  ['HAIR_COLOUR', ['colour', 'color', 'colouring', 'coloring', 'dye', 'highlight', 'highlights', 'babylights', 'balayage', 'ombre', 'streak', 'streaks', 'grey', 'gray', 'global', 'root', 'touchup', 'कलर', 'डाई', 'मेहंदीकलर']],
  ['STRAIGHTENING', ['straighten', 'straightening', 'straightener', 'smoothening', 'smoothing', 'rebond', 'rebonding', 'keratin', 'botox', 'nanoplastia', 'ironing', 'relaxer']],
  ['CURLS', ['curl', 'curls', 'curling', '=perm', 'perming', 'wave', 'waves', 'crimp', 'crimping']],
  ['NAIL_ART', ['nailart', 'nailpolish', 'gelnail', 'gelnails', 'gelpolish', 'acrylic', 'nailextension', 'nailextensions', 'nailpaint']],
  ['STYLING', ['styling', 'style', 'hairstyle', 'hairdo', 'blow', 'blowdry', 'blowout', 'setting', 'updo', 'bun', 'braid', 'braids', 'choti', 'hairgel', 'hairwax', 'hairextension', 'hairextensions']],
  ['MANICURE', ['manicure', '=mani', 'nail', 'nails', '~hand', '~hands', 'मैनीक्योर']],
  ['PEDICURE', ['pedicure', '=pedi', 'foot', 'feet', 'heel', 'heels', 'पेडीक्योर']],
  ['HAIR_SPA', ['~spa', 'hairspa', '~treatment', '~oil', '~oiling', 'serum', 'nourish', 'dandruff', 'hairfall', 'scalp', 'protein', 'hairmask', 'hairpack', 'olaplex', 'स्पा']],
  ['BODY_SPA', ['~body', 'bodyspa', 'polishing', 'aroma', 'aromatherapy', 'ayurvedic', 'ayurveda', '~steam', 'sauna', 'wrap', 'reflexology']],
  ['HAIR_WASH', ['wash', 'shampoo', 'headbath', 'hairbath', '~bath', 'conditioning']],
  ['FACIAL', ['facial', 'face', 'facepack', 'detan', 'tan', 'bleach', 'glow', '=hydra', 'hydrafacial', 'antiageing', 'ageing', 'aging', '~skin', 'फेशियल', 'ब्लीच']],
  ['CLEANUP', ['cleanup', 'scrub', 'peel', 'blackhead', 'whitehead', 'क्लीनअप']],
  ['MASSAGE', ['massage', 'champi', '=relax', 'relaxing', 'malish', 'maalish', 'shiatsu', 'मसाज', 'मालिश', 'चंपी']],
  ['EYELASH', ['lash', 'lashes', 'eyelash', 'eyelashes']],
  ['THREADING', ['threading', 'thread', 'eyebrow', 'eyebrows', 'brow', 'brows', 'upperlip', 'upperlips', 'forehead', '=chin', 'sidelocks', 'sideburns', 'थ्रेडिंग', 'आइब्रो']],
  ['WAXING', ['wax', 'waxing', 'rica', 'laser', 'hairremoval', 'underarm', 'underarms', '~arms', '~legs', 'वैक्स', 'वैक्सिंग']],
  ['MAKEUP', ['makeup', 'party', 'draping', 'saree', 'lipstick', 'lipcolour', 'lipcolor', 'eyeliner', 'hd', 'airbrush', 'मेकअप']],
  ['MEHENDI', ['mehendi', 'mehndi', 'henna', 'मेहंदी', 'मेहँदी']],
  ['PIERCING', ['piercing', 'pierce', 'earpiercing', 'nosepiercing']],
]

/** A keyword ready to match: its text (in the same normal form as the name's words), and how it may match. */
interface Key {
  text: string
  /** Only the whole word ("=word"). */
  exact: boolean
  /** A weak hint ("~word"): other words in the name go first. */
  weak: boolean
}

const KEYS: [ServiceIconName, Key[]][] = KEYWORDS.map(([icon, keys]) => [
  icon,
  keys.map((k) => ({
    text: k.replace(/^[=~]/, '').toLowerCase().normalize('NFKC'),
    exact: k.startsWith('='),
    weak: k.startsWith('~'),
  })),
])

/** Where a weak hint counts as being in the name: after every real word. */
const WEAK = 1000

/**
 * The icons that fit a service's name, best first, always ending with OTHER (the general one, a barber's pole): the
 * picker offers these first. "Haircut" → HAIRCUT, OTHER; "Kids haircut" → KIDS, HAIRCUT, OTHER; "Special package" →
 * PACKAGE, OTHER. Any case and any common way of writing it: "HAIR CUT", "hair-cut", "Haircutting", "beardtrim",
 * "Make up", "massage Head", "बाल कटिंग".
 */
export function iconsFor(name: string): ServiceIconName[] {
  const words = wordsOf(name)
  const found: [ServiceIconName, number][] = []
  for (const [icon, keys] of KEYS) {
    let best = Infinity
    for (const w of words) {
      for (const k of keys) {
        const hit = w.joined || k.exact ? w.word === k.text : matches(w.word, k.text)
        if (hit) best = Math.min(best, w.at + (k.weak ? WEAK : 0))
      }
    }
    if (best < Infinity) found.push([icon, best])
  }
  // The one named first leads ("Haircut and beard": scissors; "Beard trim": moustache); on a tie, the list's order
  found.sort((x, y) => x[1] - y[1])
  return [...found.map(([icon]) => icon), 'OTHER']
}

/**
 * The name's words in lower case (letters with their marks, as Devanagari writes vowels, and digits; "-", "/", "."
 * and the like split them), plus every two and three words written together (matched only as a whole keyword), so
 * "hair cut", "hair-cut" and "haircut" are the same; each with where it starts.
 */
export function wordsOf(name: string): { word: string; at: number; joined: boolean }[] {
  const words = name.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
  const all = words.map((word, at) => ({ word, at, joined: false }))
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length) all.push({ word: words[i] + words[i + 1], at: i, joined: true })
    if (i + 2 < words.length) all.push({ word: words[i] + words[i + 1] + words[i + 2], at: i, joined: true })
  }
  return all
}

/**
 * A word matches a keyword when it is the keyword, or (keywords of 4 letters or more) begins with it ("haircutting",
 * "facials") or (5 or more) holds it ("beardtrim", "haircolour"). Short ones ("cut", "spa", "tan") must be the whole
 * word, so "standard" isn't a tan.
 */
function matches(word: string, key: string): boolean {
  if (word === key) return true
  if (key.length >= 4 && word.startsWith(key)) return true
  return key.length >= 5 && word.includes(key)
}

/** The icon to draw: the owner's choice, or else the one that fits the name best. */
export function iconOf(service: { name: string; icon?: string | null }): ServiceIconName {
  const chosen = service.icon as ServiceIconName | null | undefined
  return chosen && SERVICE_ICONS.includes(chosen) ? chosen : iconsFor(service.name)[0]
}
