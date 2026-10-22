/** Tira um parâmetro do endereço sem recarregar (ex.: "?novo=1" depois de abrir o formulário). Só no navegador. */
export function dropParam(name: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
}
