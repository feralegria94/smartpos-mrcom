// Notas de versión de SmartPOS (estilo campanita de novedades de Moon POS).
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const SMART_CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0",
    date: "2026-08-17",
    title: "Primera versión multi-tenant",
    items: [
      "🛒 Caja con carrito editable y cantidades (estilo Moon POS)",
      "📦 Productos y Clientes (CRUD)",
      "📊 Reportes: historial por cliente + export/import CSV",
      "🧾 Boleta personalizable (logo, colores, texto de gracias)",
      "🌗 Temas claro/oscuro",
      "🔔 Campanita de novedades y botón Reportar problema",
    ],
  },
  {
    version: "0.9",
    date: "2026-08-17",
    title: "Base SaaS",
    items: [
      "🔐 Auth + onboarding con planes (básico/pro/empresa)",
      "🏢 Aislamiento multi-tenant por negocio (RLS)",
    ],
  },
];

export const NEWS_KEY = "smartpos_news_read_version";

export function latestVersion(): string {
  return SMART_CHANGELOG[0]?.version ?? "0";
}

export function hasUnreadNews(): boolean {
  try {
    return localStorage.getItem(NEWS_KEY) !== latestVersion();
  } catch {
    return true;
  }
}

export function markNewsRead(): void {
  try {
    localStorage.setItem(NEWS_KEY, latestVersion());
  } catch {
    /* ignore */
  }
}
