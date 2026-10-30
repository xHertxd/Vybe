export function AuroraBackground({ dense = false }: { dense?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(219,211,197,0.55),transparent_70%)]" />
      <div className="grid-overlay absolute inset-0 opacity-60" />
      {dense && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_90%_10%,rgba(235,230,220,0.8),transparent_70%)]" />
      )}
      <div className="noise absolute inset-0" />
    </div>
  );
}
