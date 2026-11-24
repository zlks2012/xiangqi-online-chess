import { useMemo } from "react";

export default function Ambient({ hue = "#d6382c" }: { hue?: string }) {
  const embers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 1.5 + Math.random() * 3.5,
        dur: 14 + Math.random() * 16,
        delay: -Math.random() * 26,
        dx: `${(Math.random() - 0.5) * 160}px`,
        warm: Math.random() > 0.45,
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#241026_0%,#120b14_45%,#08060a_100%)]" />
      <div
        className="absolute -left-[18%] top-[-12%] h-[70vh] w-[70vh] rounded-full blur-[110px]"
        style={{
          background: `radial-gradient(circle, ${hue}55 0%, transparent 68%)`,
          animation: "auroraShift 17s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-[14%] top-[22%] h-[62vh] w-[62vh] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, rgba(233,185,92,0.34) 0%, transparent 68%)",
          animation: "auroraShift 23s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute bottom-[-22%] left-[28%] h-[58vh] w-[58vh] rounded-full blur-[130px]"
        style={{
          background: "radial-gradient(circle, rgba(176,68,122,0.3) 0%, transparent 70%)",
          animation: "auroraShift 29s ease-in-out infinite",
        }}
      />
      {/* faint board lattice */}
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(233,185,92,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(233,185,92,0.85) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
          maskImage: "radial-gradient(80% 70% at 50% 40%, #000 20%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(80% 70% at 50% 40%, #000 20%, transparent 100%)",
        }}
      />
      {embers.map((e) => (
        <span
          key={e.id}
          className="absolute bottom-[-6vh] rounded-full"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            background: e.warm ? "#ffcf8a" : hue,
            boxShadow: `0 0 ${e.size * 4}px ${e.warm ? "#e9b95c" : hue}`,
            // @ts-expect-error custom property
            "--dx": e.dx,
            animation: `emberDrift ${e.dur}s linear ${e.delay}s infinite`,
          }}
        />
      ))}
      <div className="grain absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_50%,transparent_45%,rgba(4,2,6,0.72)_100%)]" />
    </div>
  );
}