// Crisis Room mark — a vitals-monitor pulse spiking through the outline of a
// command room, trailing to a live signal blip, with faint teal secondary
// traces. Clean vector redraw of the approved app icon so it stays crisp at
// every size and carries no watermark.

const AMBER = "#f2a93b";
const TEAL = "#4fd8c4";
const RATIO = 350 / 432; // viewBox is wider than tall

export default function Logo({ size = 24, title = "Crisis Room", className }) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * RATIO)}
      viewBox="32 96 432 350"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* secondary signal traces */}
        <path d="M96 250 H186" stroke={TEAL} strokeWidth="14" />
        <path d="M120 314 H238" stroke={TEAL} strokeWidth="14" />
        <path d="M150 340 H210" stroke={TEAL} strokeWidth="14" />

        {/* command-room outline, held back so the pulse stays the hero */}
        <path d="M158 300 V202 L256 138 L354 202 V300" stroke={AMBER} strokeWidth="13" opacity="0.72" />

        {/* vitals pulse */}
        <path
          d="M44 264 H196 L212 292 L228 264 L268 108 L300 434 L330 264 H398"
          stroke={AMBER}
          strokeWidth="24"
        />
      </g>

      {/* live signal blip */}
      <circle cx="430" cy="264" r="17" fill={AMBER} />
    </svg>
  );
}
