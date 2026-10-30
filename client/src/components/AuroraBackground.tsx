export function AuroraBackground({ dense = false }: { dense?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#171719]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(253,229,183,0.06),transparent_70%)]" />
      {dense && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_10%,rgba(253,229,183,0.04),transparent_70%)]" />
      )}
    </div>
  );
}
