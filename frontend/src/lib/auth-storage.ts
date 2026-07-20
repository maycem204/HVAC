const TOKEN_KEY = "token";
const USER_KEY = "user";

export function getAuthToken() {
  const tabToken = sessionStorage.getItem(TOKEN_KEY);
  if (tabToken) return tabToken;
  // Migration unique depuis l'ancien stockage partagé entre tous les onglets.
  const legacyToken = localStorage.getItem(TOKEN_KEY);
  if (!legacyToken) return null;
  sessionStorage.setItem(TOKEN_KEY, legacyToken);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  return legacyToken;
}

export function storeAuthSession(token: string, user: unknown) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
