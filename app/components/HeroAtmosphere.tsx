/**
 * HeroAtmosphere — the page's one deliberate background flourish.
 * A faint dot-grid plus two soft color glows positioned behind the hero
 * content only. Static (no animation loop) so it never competes for
 * attention with the live LiveMonitorPanel, which is the actual hero subject.
 */

export function HeroAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 overflow-hidden bg-fade-mask pointer-events-none"
    >
      <div className="absolute inset-0 bg-grid" />
      <div className="absolute -top-24 left-[8%] h-[420px] w-[420px] bg-glow-lime blur-3xl" />
      <div className="absolute top-[-60px] right-[5%] h-[460px] w-[460px] bg-glow-cyan blur-3xl" />
    </div>
  );
}
