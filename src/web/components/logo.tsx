/*
 * Logo "azeitona": desenho de linha em vetor. Traço = currentColor; miolo = --card; folha = classe .logo-leaf (globals.css).
 * Logo = duas azeitonas (menu, login). LogoMark = uma azeitona só (tamanhos bem pequenos, ícone da aba).
 */

export function Logo({ className, strokeWidth = 3.4 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="azeitona" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="29" cy="60" rx="26" ry="37" fill="var(--card)" />
      <path d="M11 63 Q13 87 31 88" />
      <path d="M35 53 Q8 22 63 2 Q75 41 35 53 Z" className="logo-leaf" stroke="none" />
      <path d="M35 53 L50 27" />
      <ellipse cx="76" cy="71" rx="20" ry="27" fill="var(--card)" />
      <path d="M63 75 Q65 92 78 93" />
      <path d="M73 62 Q58 40 90 26 Q97 52 73 62 Z" fill="var(--card)" />
      <path d="M73 62 L82 46" />
    </svg>
  );
}

export function LogoMark({ className, strokeWidth = 6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="8 2 84 96" className={className} role="img" aria-label="azeitona" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="46" cy="60" rx="30" ry="36" fill="var(--card)" />
      <path d="M28 64 Q30 84 47 86" />
      <path d="M52 48 Q36 20 84 6 Q90 38 52 48 Z" className="logo-leaf" />
      <path d="M52 48 L66 28" />
    </svg>
  );
}
