/**
 * The pictures shown next to a salon service (the backend's ServiceIcon names) and which of them fit a service's
 * name. The same file is in the partner and customer apps.
 *
 * Drawings: thin-line SVG on a 24×24 grid, stroke 2, round ends, drawn for Clozest; a few use Lucide's shapes (marked
 * below; https://lucide.dev, ISC licence: "Copyright (c) Lucide Icons and Contributors; permission to use, copy,
 * modify and distribute is granted"). Each was checked with a blind recognition test (fresh reviewers named the
 * service from the picture alone, at phone size); a service that can't be drawn without confusion gets OTHER, the
 * salon chair, rather than a picture that reads as something else.
 */

export const SERVICE_ICONS = [
  'HAIRCUT', 'TRIM', 'BEARD', 'MOUSTACHE', 'SHAVE', 'HAIR_WASH', 'HAIR_SPA', 'HEAD_MASSAGE', 'HAIR_COLOUR',
  'STYLING', 'STRAIGHTENING', 'CURLS', 'BRAIDS', 'FACIAL', 'THREADING', 'WAXING', 'EYELASH', 'MAKEUP', 'BRIDAL',
  'MEHENDI', 'MANICURE', 'PEDICURE', 'MASSAGE', 'BODY_SPA', 'PIERCING', 'KIDS', 'PACKAGE', 'OTHER',
] as const
export type ServiceIconName = (typeof SERVICE_ICONS)[number]

/** One SVG element: its tag and attributes. */
export type IconNode = [tag: 'path' | 'circle' | 'rect' | 'ellipse', attrs: Record<string, string>]

export const ICON_DRAWINGS: Record<ServiceIconName, IconNode[]> = {
  // Scissors (Lucide "scissors")
  HAIRCUT: [
    ['circle', { cx: '6', cy: '6', r: '3' }],
    ['path', { d: 'M8.12 8.12 12 12' }],
    ['path', { d: 'M20 4 8.12 15.88' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
    ['path', { d: 'M14.8 14.8 20 20' }],
  ],
  // An electric clipper
  TRIM: [
    ['path', { d: 'M8 9h8v8a4 4 0 0 1-8 0z' }],
    ['rect', { x: '7', y: '5.5', width: '10', height: '3.5', rx: '1' }],
    ['path', { d: 'M8.5 3v2.5M11 3v2.5M13.5 3v2.5M16 3v2.5' }],
    ['path', { d: 'M12 13v2' }],
  ],
  // A full beard
  BEARD: [
    ['path', { d: 'M5 4v6c0 6.5 3 11 7 11s7-4.5 7-11V4' }],
    ['path', { d: 'M8 10.5c1 3 2.3 4 4 4s3-1 4-4' }],
    ['path', { d: 'M9 12.5c1-.8 2-.8 3 0 1-.8 2-.8 3 0' }],
    ['path', { d: 'M10.5 17.5h3' }],
  ],
  // A curled moustache
  MOUSTACHE: [
    ['path', { d: 'M12 11C10.3 8.2 7.2 7.6 5.3 9.3 3.9 10.6 3.4 13 1.8 12.6c-.9-.3-.8-1.7.2-2' }],
    ['path', { d: 'M1.8 12.6C3 15.6 6.6 16.8 9.2 15.4 10.4 14.8 11.3 13.9 12 13c.7.9 1.6 1.8 2.8 2.4 2.6 1.4 6.2.2 7.4-2.8' }],
    ['path', { d: 'M12 11c1.7-2.8 4.8-3.4 6.7-1.7 1.4 1.3 1.9 3.7 3.5 3.3.9-.3.8-1.7-.2-2' }],
  ],
  // A safety razor
  SHAVE: [
    ['rect', { x: '4', y: '3', width: '16', height: '4.5', rx: '1.5' }],
    ['path', { d: 'M6 5.25h12' }],
    ['path', { d: 'M12 7.5v2.5' }],
    ['path', { d: 'M10.5 10h3v11a1.5 1.5 0 0 1-3 0z' }],
    ['path', { d: 'M10.5 13.5h3M10.5 16.5h3' }],
  ],
  // A shampoo tube with foam
  HAIR_WASH: [
    ['path', { d: 'M5 4h8l-1 15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z' }],
    ['path', { d: 'M4 4h10' }],
    ['path', { d: 'M7.5 21v1.5h3V21' }],
    ['path', { d: 'M7 9h4' }],
    ['circle', { cx: '18', cy: '9', r: '2.3' }],
    ['circle', { cx: '17.5', cy: '15', r: '1.5' }],
    ['circle', { cx: '20.5', cy: '4', r: '1' }],
  ],
  // Steam rising from a head
  HAIR_SPA: [
    ['path', { d: 'M5 21v-2.5a7 7 0 0 1 14 0V21' }],
    ['path', { d: 'M8.5 9.5c-1-1.3 1-2.2 0-3.5s1-2.2 0-3.5' }],
    ['path', { d: 'M12 9.5c-1-1.3 1-2.2 0-3.5s1-2.2 0-3.5' }],
    ['path', { d: 'M15.5 9.5c-1-1.3 1-2.2 0-3.5s1-2.2 0-3.5' }],
  ],
  // A hand on a head, rubbing (champi); the hand is Lucide "hand"
  HEAD_MASSAGE: [
    ['path', { d: 'M5 22v-3a7 7 0 0 1 14 0v3' }],
    ['path', { d: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15', transform: 'translate(19 13) rotate(180) scale(.55)', strokeWidth: '2.6' }],
    ['path', { d: 'M3 16c-1-1.5-1-3.5 0-5M21 16c1-1.5 1-3.5 0-5' }],
  ],
  // A colour bowl and tint brush
  HAIR_COLOUR: [
    ['path', { d: 'M2.5 13h13a6.5 6.5 0 0 1-13 0z' }],
    ['path', { d: 'M21.5 2.5 15.5 8.5' }],
    ['path', { d: 'M14.5 7.5l2 2-3.5 3.5a1.4 1.4 0 0 1-2-2z' }],
  ],
  // A hair dryer
  STYLING: [
    ['path', { d: 'M3 9a5 5 0 0 1 5-5h7l3 1.5v7L15 14H8a5 5 0 0 1-5-5z' }],
    ['circle', { cx: '8', cy: '9', r: '1.5' }],
    ['path', { d: 'M10 14l-1.5 6.5a1 1 0 0 0 1 1.5h1.5a1 1 0 0 0 1-.8L13 14' }],
    ['path', { d: 'M21 7v4' }],
  ],
  // A flat iron: wavy hair above it, straight below
  STRAIGHTENING: [
    ['path', { d: 'M6 2c-1.5 1.5 1.5 3 0 4.5S7.5 9.5 6 11M12 2c-1.5 1.5 1.5 3 0 4.5s1.5 3 0 4.5M18 2c-1.5 1.5 1.5 3 0 4.5s1.5 3 0 4.5' }],
    ['path', { d: 'M3 12.5h18' }],
    ['path', { d: 'M6 14v8M12 14v8M18 14v8' }],
  ],
  // Ringlets
  CURLS: [
    ['path', { d: 'M7 2c2 0 2 2.2 0 2.2S5 6.4 7 6.4 9 8.6 7 8.6 5 10.8 7 10.8s2 2.2 0 2.2-2 2.2 0 2.2' }],
    ['path', { d: 'M12 2c2 0 2 2.2 0 2.2s-2 2.2 0 2.2 2 2.2 0 2.2-2 2.2 0 2.2 2 2.2 0 2.2-2 2.2 0 2.2 2 2.2 0 2.2-2 2.2 0 2.2' }],
    ['path', { d: 'M17 2c2 0 2 2.2 0 2.2s-2 2.2 0 2.2 2 2.2 0 2.2-2 2.2 0 2.2 2 2.2 0 2.2' }],
  ],
  // A plait
  BRAIDS: [
    ['path', { d: 'M12 3c-3 0-3.5 3.5-1.5 5 3-.5 3.5-3.5 1.5-5z' }],
    ['path', { d: 'M12 7.5c3 0 3.5 3.5 1.5 5-3-.5-3.5-3.5-1.5-5z' }],
    ['path', { d: 'M12 12c-3 0-3.5 3.5-1.5 5 3-.5 3.5-3.5 1.5-5z' }],
    ['path', { d: 'M11 17.5h2.5' }],
    ['path', { d: 'M12.2 17.5c-.8 1.3-1.2 2.8-1.2 4.5M12.2 17.5c.8 1.3 1.2 2.8 1.2 4.5' }],
  ],
  // A face with a spa headband and a face pack
  FACIAL: [
    ['path', { d: 'M12 2.5a7.5 9.5 0 0 0 0 19 7.5 9.5 0 0 0 0-19z' }],
    ['path', { d: 'M4.8 7.5c4.5-1.6 9.9-1.6 14.4 0' }],
    ['path', { d: 'M5 9.5c4.5-1.4 9.5-1.4 14 0' }],
    ['path', { d: 'M8 12.5c.7.6 1.6.6 2.3 0M13.7 12.5c.7.6 1.6.6 2.3 0' }],
    ['path', { d: 'M7.5 15.5h.01M16.5 15.5h.01M12 17.8h.01' }],
  ],
  // An eyebrow above an eye, and the thread
  THREADING: [
    ['path', { d: 'M3 9c3-3.5 9-4 15-1.5' }],
    ['path', { d: 'M4 15s3-3.5 8-3.5 8 3.5 8 3.5-3 3.5-8 3.5-8-3.5-8-3.5z' }],
    ['circle', { cx: '12', cy: '15', r: '1.5' }],
    ['path', { d: 'M14 2.5c2 1.5 4 1.5 7 0M14 4.5c2-1.5 4-1.5 7 0' }],
  ],
  // A wax pot and spatula
  WAXING: [
    ['path', { d: 'M4 10h12v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }],
    ['path', { d: 'M3 10h14' }],
    ['path', { d: 'M7 10v2.5a1 1 0 0 0 2 0V10M12 10v1.5a1 1 0 0 0 2 0V10' }],
    ['path', { d: 'M11 13 20 3.5a1.5 1.5 0 0 1 2 2L13 15' }],
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
  // A lipstick
  MAKEUP: [
    ['path', { d: 'M9.5 11V6.5l5-3.5v8' }],
    ['rect', { x: '8.5', y: '11', width: '7', height: '3', rx: '.5' }],
    ['rect', { x: '8', y: '14', width: '8', height: '8', rx: '1' }],
  ],
  // Wedding rings (bride and groom)
  BRIDAL: [
    ['circle', { cx: '9', cy: '14', r: '5.5' }],
    ['circle', { cx: '15', cy: '14', r: '5.5' }],
    ['path', { d: 'M13.5 3.5 15 2l1.5 1.5L15 5.5z' }],
    ['path', { d: 'M8 4l1 1.2M20 4l-1 1.2' }],
  ],
  // A palm with a henna design (Lucide "hand")
  MEHENDI: [
    ['path', { d: 'M18 11V6a2 2 0 0 0-4 0' }],
    ['path', { d: 'M14 10V4a2 2 0 0 0-4 0v2' }],
    ['path', { d: 'M10 10.5V6a2 2 0 0 0-4 0v8' }],
    ['path', { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }],
    ['circle', { cx: '13', cy: '15', r: '2' }],
    ['circle', { cx: '13', cy: '15', r: '.4', fill: 'currentColor' }],
  ],
  // A bottle of nail polish
  MANICURE: [
    ['rect', { x: '6', y: '11', width: '12', height: '10', rx: '2.5' }],
    ['path', { d: 'M9 11V8h6v3' }],
    ['path', { d: 'M10 8V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V8' }],
    ['path', { d: 'M9 15h6' }],
  ],
  // A foot in a tub of water
  PEDICURE: [
    ['path', { d: 'M3 13h18l-1.5 8h-15z' }],
    ['path', { d: 'M8 2v9.5' }],
    ['path', { d: 'M12.5 2v6c0 1.8 1 3 2.5 3.5' }],
    ['path', { d: 'M6 16.5c2 1 4-1 6 0s4 1 6 0' }],
  ],
  // Someone lying down, a hand on the back (Lucide "hand")
  MASSAGE: [
    ['circle', { cx: '4.5', cy: '13', r: '2' }],
    ['path', { d: 'M8 14.5c3-2 9-2 13-.5' }],
    ['path', { d: 'M2 17.5h20M4 17.5V21M20 17.5V21' }],
    ['path', { d: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15', transform: 'translate(8 1) scale(.42)', strokeWidth: '3' }],
  ],
  // A lotus
  BODY_SPA: [
    ['path', { d: 'M12 20c-2.5-1.8-3.8-4.5-3.8-7.5S9.5 6.8 12 4.5c2.5 2.3 3.8 5 3.8 8S14.5 18.2 12 20z' }],
    ['path', { d: 'M12 20c-4 .2-7.3-1.6-9-5.3 1.6-1 3.4-1.4 5.3-1.1' }],
    ['path', { d: 'M12 20c4 .2 7.3-1.6 9-5.3-1.6-1-3.4-1.4-5.3-1.1' }],
    ['path', { d: 'M5 22h14' }],
  ],
  // An ear with an earring
  PIERCING: [
    ['path', { d: 'M6 8.5a6 6 0 0 1 12 0c0 2.5-1.5 3.8-2.8 5-1.2 1.1-1.7 2-1.7 3.5a3.5 3.5 0 0 1-7 0' }],
    ['path', { d: 'M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5' }],
    ['circle', { cx: '9', cy: '20.3', r: '2' }],
  ],
  // A child (Lucide "baby")
  KIDS: [
    ['path', { d: 'M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5' }],
    ['path', { d: 'M15 12h.01' }],
    ['path', { d: 'M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1' }],
    ['path', { d: 'M9 12h.01' }],
  ],
  // A price tag with a plus: a combo of services
  PACKAGE: [
    ['path', { d: 'M3 12.5V4a1 1 0 0 1 1-1h8.5l9 9a1.4 1.4 0 0 1 0 2L14 21.5a1.4 1.4 0 0 1-2 0z' }],
    ['circle', { cx: '7.5', cy: '7.5', r: '1.2' }],
    ['path', { d: 'M11 14h5M13.5 11.5v5' }],
  ],
  // A salon chair: any service none of the others shows
  OTHER: [
    ['rect', { x: '4.5', y: '1.5', width: '4', height: '2.5', rx: '1' }],
    ['rect', { x: '5', y: '5', width: '3.5', height: '7.5', rx: '1' }],
    ['rect', { x: '5', y: '12.5', width: '10.5', height: '2.5', rx: '1' }],
    ['path', { d: 'M8.5 9h6a1 1 0 0 1 1 1v2.5' }],
    ['path', { d: 'M10.25 15v4' }],
    ['path', { d: 'M6.5 21h7.5' }],
    ['path', { d: 'M15.5 14.5 18.5 19H16' }],
  ],
}

/**
 * What each picture is for, as the picker names it (the service, not the drawing): the key of its words in the
 * language files, shown with t(ICON_LABELS[icon]).
 */
export const ICON_LABELS: Record<ServiceIconName, string> = {
  HAIRCUT: 'setup.iconHaircut',
  TRIM: 'setup.iconTrim',
  BEARD: 'setup.iconBeard',
  MOUSTACHE: 'setup.iconMoustache',
  SHAVE: 'setup.iconShave',
  HAIR_WASH: 'setup.iconHairWash',
  HAIR_SPA: 'setup.iconHairSpa',
  HEAD_MASSAGE: 'setup.iconHeadMassage',
  HAIR_COLOUR: 'setup.iconHairColour',
  STYLING: 'setup.iconStyling',
  STRAIGHTENING: 'setup.iconStraightening',
  CURLS: 'setup.iconCurls',
  BRAIDS: 'setup.iconBraids',
  FACIAL: 'setup.iconFacial',
  THREADING: 'setup.iconThreading',
  WAXING: 'setup.iconWaxing',
  EYELASH: 'setup.iconEyelash',
  MAKEUP: 'setup.iconMakeup',
  BRIDAL: 'setup.iconBridal',
  MEHENDI: 'setup.iconMehendi',
  MANICURE: 'setup.iconManicure',
  PEDICURE: 'setup.iconPedicure',
  MASSAGE: 'setup.iconMassage',
  BODY_SPA: 'setup.iconBodySpa',
  PIERCING: 'setup.iconPiercing',
  KIDS: 'setup.iconKids',
  PACKAGE: 'setup.iconPackage',
  OTHER: 'setup.iconOther',
}

/**
 * Words in a service's name that say which icons fit it, any case, in English, in Hindi as salons write it in
 * English letters, and in Devanagari. A plain keyword also matches the start of a longer word (4 letters or more:
 * "facials") or a word holding it (5 or more: "beardtrim"). "=word" matches only that whole word ("baby" but not
 * "babylights", "perm" but not "permanent"). "~word" is a weak hint: it fits, but any other word in the name goes
 * before it ("Spa pedicure" is a pedicure first, "Relaxing head massage" a head massage, "Boy cut" a haircut). On a
 * tie, the order below decides ("massage head" is a head massage before a body massage). "~=word" is both.
 */
const KEYWORDS: [ServiceIconName, string[]][] = [
  ['PACKAGE', ['package', 'packages', 'combo', 'combos', 'deal', 'membership', 'पैकेज']],
  ['BRIDAL', ['bridal', 'bride', '=groom', 'wedding', 'dulha', 'dulhan', 'shaadi', 'sehra', 'engagement', 'reception', 'दुल्हन', 'दूल्हा', 'शादी']],
  ['KIDS', ['=kid', 'kids', 'child', 'children', '=baby', '~boy', '~boys', '~girl', '~girls', 'bachcha', 'baccha', 'bacche', 'mundan', 'बच्चा', 'बच्चे', 'बच्चों', 'मुंडन']],
  ['BEARD', ['beard', 'goatee', 'dadhi', 'daadhi', 'daari', 'daadi', 'stubble', 'दाढ़ी', 'दाढी']],
  ['MOUSTACHE', ['moustache', 'mustache', 'mooch', 'mooche', 'muchh', 'moochh', 'मूंछ', 'मूँछ']],
  ['SHAVE', ['shave', 'shaving', 'razor', 'headshave', 'शेव', 'शेविंग']],
  ['HAIRCUT', ['haircut', 'cut', 'cutting', 'crop', 'fade', 'skinfade', 'bob', 'layer', 'layers', 'undercut', 'boycut', '~baal', 'katai', 'kating', '~trim', 'कटिंग', 'कट', 'हेयरकट']],
  ['TRIM', ['trim', 'trimming', 'trimmer', 'hairtrim', 'clipper', 'clippers', 'machinecut', 'ट्रिम']],
  ['HAIR_COLOUR', ['colour', 'color', 'colouring', 'coloring', 'dye', 'highlight', 'highlights', 'babylights', 'balayage', 'ombre', 'streak', 'streaks', 'grey', 'gray', 'global', 'root', 'touchup', 'कलर', 'डाई', 'मेहंदीकलर']],
  ['STRAIGHTENING', ['straighten', 'straightening', 'straightener', 'smoothening', 'smoothing', 'rebond', 'rebonding', 'keratin', 'botox', 'nanoplastia', 'ironing', 'relaxer']],
  ['CURLS', ['curl', 'curls', 'curling', '=perm', 'perming', 'wave', 'waves', 'crimp', 'crimping']],
  ['BRAIDS', ['braid', 'braids', 'braiding', 'plait', 'plaits', 'choti', 'chotti', 'चोटी']],
  ['MANICURE', ['manicure', '=mani', 'nail', 'nails', 'nailart', 'nailpolish', 'gelnail', 'gelnails', 'gelpolish', 'acrylic', 'nailextension', 'nailextensions', 'nailpaint', '~hand', '~hands', 'मैनीक्योर']],
  ['STYLING', ['styling', 'style', 'hairstyle', 'hairdo', 'blow', 'blowdry', 'blowout', 'setting', 'updo', 'bun', 'hairgel', 'hairwax']],
  ['PEDICURE', ['pedicure', '=pedi', 'foot', 'feet', 'heel', 'heels', 'पेडीक्योर']],
  ['HEAD_MASSAGE', ['headmassage', 'massagehead', 'headoil', 'headoilmassage', 'oilmassage', 'champi', 'chumpi', 'malish', 'maalish', '~head', '~oil', '~oiling', 'चंपी', 'मालिश', 'हेडमसाज', 'हेडमालिश', '~सिर']],
  ['HAIR_SPA', ['~spa', 'hairspa', '~treatment', 'serum', 'nourish', 'dandruff', 'hairfall', 'scalp', 'protein', 'hairmask', 'hairpack', 'olaplex', 'स्पा']],
  ['BODY_SPA', ['~body', 'bodyspa', 'polishing', 'aroma', 'aromatherapy', 'ayurvedic', 'ayurveda', '~steam', 'sauna', 'wrap', 'reflexology']],
  ['HAIR_WASH', ['wash', 'shampoo', 'headbath', 'hairbath', '~bath', 'conditioning', 'conditioner', 'dhona', 'dhulai', 'धोना', 'वॉश', 'शैम्पू']],
  ['FACIAL', ['facial', 'face', 'facepack', 'detan', 'tan', 'bleach', 'glow', '=hydra', 'hydrafacial', 'antiageing', 'ageing', 'aging', 'acne', 'pimple', 'pimples', 'undereye', 'darkcircle', 'darkcircles', 'pigmentation', 'cleanup', 'scrub', 'peel', 'blackhead', 'whitehead', '~skin', 'फेशियल', 'ब्लीच', 'क्लीनअप', 'डीटैन']],
  ['MASSAGE', ['massage', 'bodymassage', 'backmassage', 'bodymalish', 'bodymaalish', 'bodyoil', 'bodyoilmassage', 'footmassage', 'legmassage', 'footmaalish', 'footmalish', 'pairkimaalish', 'pairkimalish', '~=relax', '~relaxing', 'shiatsu', 'मसाज', 'बॉडीमालिश', 'बॉडीमसाज', 'पैरकीमालिश']],
  ['EYELASH', ['lash', 'lashes', 'eyelash', 'eyelashes']],
  ['THREADING', ['threading', 'thread', 'eyebrow', 'eyebrows', 'brow', 'brows', '~upperlip', '~upperlips', '~forehead', '~=chin', '~sidelocks', '~sideburns', 'थ्रेडिंग', 'आइब्रो']],
  ['WAXING', ['wax', 'waxing', 'rica', 'laser', 'hairremoval', 'underarm', 'underarms', '~arms', '~legs', 'वैक्स', 'वैक्सिंग']],
  ['MAKEUP', ['makeup', '~party', 'lipstick', 'lipcolour', 'lipcolor', 'eyeliner', 'hd', 'airbrush', 'मेकअप']],
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
    text: k.replace(/^[=~]+/, '').toLowerCase().normalize('NFKC'),
    exact: /^[~]?=/.test(k),
    weak: /^=?~/.test(k),
  })),
])

/** Where a weak hint counts as being in the name: after every real word. */
const WEAK = 1000

/**
 * The icons that fit a service's name, best first, always ending with OTHER (the general one, a salon chair): the
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
  // The one named first leads ("Haircut and beard": scissors; "Beard trim": the beard, then the clipper); on a tie, the list's order
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
