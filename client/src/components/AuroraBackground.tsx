export function AuroraBackground({ dense = false }: { dense?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#06060a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-10%,rgba(59,30,120,0.38),transparent_60%)]" />
      <div className="grid-overlay absolute inset-0 opacity-70" />

      <div
        className="animate-drift absolute -left-[18%] -top-[22%] h-[52vw] w-[52vw] rounded-full blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, rgba(124,58,237,0.42), rgba(76,29,149,0.16) 55%, transparent 72%)',
        }}
      />
      <div
        className="animate-float-slow absolute -right-[14%] top-[6%] h-[42vw] w-[42vw] rounded-full blur-[130px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.24), rgba(8,145,178,0.1) 55%, transparent 72%)',
        }}
      />
      <div
        className="animate-drift absolute bottom-[-28%] left-[20%] h-[48vw] w-[48vw] rounded-full blur-[140px]"
        style={{
          animationDelay: '-8s',
          background:
            'radial-gradient(circle at 50% 50%, rgba(236,72,153,0.18), rgba(157,23,77,0.08) 55%, transparent 72%)',
        }}
      />

      {dense && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 40% 30% at 85% 15%, rgba(34,211,238,0.12), transparent 70%), radial-gradient(ellipse 30% 30% at 10% 85%, rgba(236,72,153,0.1), transparent 70%)',
          }}
        />
      )}

      <div className="noise absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#06060a] to-transparent" />
    </div>
  );
}
