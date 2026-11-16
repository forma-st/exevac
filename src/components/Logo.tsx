/* Logo FORMAST (312 × 80 px), servi depuis /public. */
export function Logo({ className = "h-10" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-formast.png" alt="FORMAST — Sécurité au travail" width={312} height={80} className={`w-auto ${className}`} />;
}
