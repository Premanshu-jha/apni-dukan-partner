import { useId } from 'react'

/**
 * The Clozest logo, drawn in code so it stays sharp at any size and follows the theme's colours: the location pin is
 * the "C" (blue-to-violet, with the shop and its orange awning inside) and the word goes on as "LOZEST", with the
 * orange sparkle after the T. The whole picture is hidden from screen readers; they read `name` instead.
 */
export function Logo({ name = 'Clozest', className = '' }: { name?: string; className?: string }) {
  // Ids inside an inline SVG are page-wide: make them unique in case two logos are on screen
  const id = useId().replace(/:/g, '')
  const fill = `${id}-fill`
  const cut = `${id}-cut`
  return (
    <span className={`inline-block ${className}`}>
      <span className="sr-only">{name}</span>
      <svg viewBox="66 66 754 202" aria-hidden="true" focusable="false" className="block h-full w-auto">
        <defs>
          <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="180" y2="222">
            <stop offset="0" stopColor="#18b4ff" />
            <stop offset="0.5" stopColor="#3d5bff" />
            <stop offset="1" stopColor="#5b21e6" />
          </linearGradient>
          {/* The pin minus its hole and the C's opening (facing right, ends level with each other) */}
          <mask id={cut} maskUnits="userSpaceOnUse" x="-20" y="-100" width="340" height="380">
            <rect x="-20" y="-100" width="340" height="380" fill="#fff" />
            <circle cx="100" cy="100" r="52" fill="#000" />
            <path d="M100 100 L248.6 -33.8 L320 -33.8 L320 233.8 L248.6 233.8 Z" fill="#000" />
          </mask>
        </defs>
        <g transform="translate(73.7 114.5) scale(0.63)">
          <g fill={`url(#${fill})`}>
            <path mask={`url(#${cut})`} d="M100 222 L39.2 166.3 A90 90 0 1 1 160.8 166.3 Z" />
            <circle cx="152.8" cy="52.5" r="19" />
            <circle cx="152.8" cy="147.5" r="19" />
          </g>
          <rect x="67" y="66" width="66" height="7" rx="3.5" fill="#ff7a00" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} fill={i % 2 ? '#ffd2a8' : '#ff7a00'}>
              <rect x={70 + 12 * i} y="72" width="12" height="14" />
              <circle cx={76 + 12 * i} cy="86" r="6" />
            </g>
          ))}
          <rect x="74" y="94" width="52" height="40" rx="3" className="fill-ink" />
          <rect x="80" y="104" width="15" height="30" rx="2" className="fill-bg" />
          <rect x="101" y="104" width="19" height="13" rx="2" className="fill-bg" />
        </g>
        <path d="M90 251 A47 10 0 0 0 184 251" fill="none" stroke="#ff7a00" strokeWidth="6" strokeLinecap="round" />
        <text x="195" y="230" fontSize="150" fontWeight="700" textLength="560" lengthAdjust="spacing" className="fill-ink font-display">
          LOZEST
        </text>
        <g stroke="#ff7a00" strokeWidth="7" strokeLinecap="round">
          <line x1="772" y1="96" x2="776" y2="74" />
          <line x1="784" y1="104" x2="800" y2="90" />
          <line x1="790" y1="116" x2="812" y2="114" />
        </g>
      </svg>
    </span>
  )
}
