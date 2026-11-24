import type { ReactNode, SVGProps } from "react";
import { cn } from "../utils/cn";

type IconProps = SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconSound = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);
export const IconMute = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="m16 9 5 6M21 9l-5 6" />
  </svg>
);
export const IconPause = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </svg>
);
export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4.8 19 12 7 19.2z" />
  </svg>
);
export const IconUndo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8h9a5.5 5.5 0 0 1 0 11H8" />
    <path d="m4 8 4-4M4 8l4 4" />
  </svg>
);
export const IconBulb = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18h6" />
    <path d="M10 21.5h4" />
    <path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7h6c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5Z" />
  </svg>
);
export const IconRestart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 3.5V9h-5.5" />
  </svg>
);
export const IconTrophy = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 10.5M17 5.5h2.5A2.5 2.5 0 0 1 17 10.5" />
    <path d="M12 14v3.5M8.5 21h7l-.8-3.5H9.3z" />
  </svg>
);
export const IconSwords = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14.5 14.5 20 20l1-3-3-1-5.5-5.5" />
    <path d="M3 3h4l9.5 9.5-3 3L4 6z" />
    <path d="M9.5 14.5 4 20l-1-3 3-1 5.5-5.5" />
  </svg>
);
export const IconCrown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7.5 6.5 11 12 4l5.5 7L21 7.5 19 19H5z" />
  </svg>
);
export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const IconFlip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v18" />
    <path d="M8 7 4 11l4 4M16 7l4 4-4 4" />
  </svg>
);
export const IconKeyboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 13h.01M9.5 13h5" />
  </svg>
);
export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

export const IconUsers = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S13.9 16 14.5 19" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M15.5 14.6c2.3.1 4.2 1.4 4.8 4" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7.5 11l4.5 4.5L16.5 11M4.5 19.5h15" />
  </svg>
);

export const IconWifi = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 9.5a13 13 0 0 1 18 0M6.5 13a8 8 0 0 1 11 0M10 16.5a3.2 3.2 0 0 1 4 0" />
    <circle cx="12" cy="19.2" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconFlipBoard = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 8V5h-3M7 16v3h3" />
    <path d="M17 5a9 9 0 0 0-14 5M7 19a9 9 0 0 0 14-5" />
  </svg>
);

/* ---------------- buttons ---------------- */

type Variant = "primary" | "gold" | "ghost" | "danger" | "quiet";

export function Btn({
  children,
  onClick,
  variant = "ghost",
  className,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const variants: Record<Variant, string> = {
    primary:
      "bg-gradient-to-b from-cinnabar-2 to-cinnabar-3 text-paper border-cinnabar-2/60 shadow-[0_6px_0_-1px_rgba(90,16,12,0.9),0_12px_28px_-8px_rgba(255,95,71,0.7)] hover:from-[#ff7460] hover:to-[#a52a20]",
    gold: "bg-gradient-to-b from-gold-2 to-gold-3 text-ink-950 border-gold-2/70 shadow-[0_6px_0_-1px_rgba(90,66,16,0.9),0_12px_28px_-8px_rgba(233,185,92,0.6)] hover:from-[#fff0cd]",
    ghost:
      "bg-ink-800/80 text-paper/90 border-gold/25 hover:border-gold/60 hover:bg-ink-700/80 hover:text-gold-2",
    danger:
      "bg-ink-800/80 text-cinnabar-2 border-cinnabar/40 hover:bg-cinnabar/20 hover:border-cinnabar-2/70",
    quiet: "bg-transparent text-paper/55 border-transparent hover:text-gold-2 hover:bg-white/5",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold tracking-wide transition-all duration-150 active:translate-y-[3px] active:shadow-none",
        "disabled:pointer-events-none disabled:opacity-35",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  onClick,
  title,
  active,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-xl border transition-all duration-150 active:scale-90",
        active
          ? "border-gold/70 bg-gold/20 text-gold-2 shadow-[0_0_18px_-4px_rgba(233,185,92,0.8)]"
          : "border-gold/20 bg-ink-800/70 text-paper/70 hover:border-gold/50 hover:text-gold-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className,
  title,
  icon,
  right,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-gold/15 bg-gradient-to-b from-ink-850/90 to-ink-900/95 shadow-[inset_0_1px_0_rgba(255,221,154,0.08)]",
        className,
      )}
    >
      {title && (
        <header className="flex items-center gap-2 border-b border-gold/10 px-3.5 py-2.5">
          <span className="text-gold/80">{icon}</span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold/70">{title}</h3>
          <div className="ml-auto">{right}</div>
        </header>
      )}
      {children}
    </section>
  );
}