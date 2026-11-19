// Recuperação de erros na tela (usado por app/error.tsx e app/global-error.tsx).
//
// O caso mais comum: o site é publicado de novo enquanto alguém está com ele aberto. Ao navegar, o navegador
// pede arquivos de código da versão antiga, que não existem mais, e a página quebra (ChunkLoadError). Recarregar
// pega a versão nova e resolve, então isso é feito sozinho, uma única vez por minuto (para nunca virar um laço).

const RELOAD_KEY = 'igor-bianca-error-reload';

/** Erro de "versão antiga do site" (arquivo de código que não existe mais depois de um novo deploy). */
export function isStaleVersionError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    text
  );
}

/** Recarrega a página uma vez (por minuto). Devolve false se já recarregou há pouco. */
export function reloadOnce() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Sem armazenamento: recarrega mesmo assim (o navegador já terá a versão nova).
  }
  window.location.reload();
  return true;
}
