// Roda antes da primeira pintura da tela para aplicar o tema salvo, evitando "piscar" claro→escuro.
// Valores possíveis em localStorage("theme"): "light" | "dark" | ausente (segue o sistema).
const script = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
