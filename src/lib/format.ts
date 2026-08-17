// Lógica de negocio portada desde Moon POS (script.js) a TypeScript.
// Mismos cálculos CLP, escapado y normalización de precios chilenos.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normaliza precio chileno (portado y reforzado desde Moon POS).
// Acepta: "1500", "1.500", "1,500", "1,5", "$1.500", "-500".
// Regla: separador seguido de 3 dígitos = miles; 1-2 dígitos = decimal.
// Si hay ambos, el ÚLTIMO es decimal.
export function normalizeCLP(raw: string | number): number {
  if (typeof raw === "number") return Math.round(raw);
  let s = String(raw ?? "").trim();
  if (!s) return 0;
  // conserva dígitos, puntos, comas y signo menos; descarta símbolos/espacios
  s = s.replace(/[^\d.,-]/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, "."); // coma decimal
    } else {
      s = s.replace(/,/g, "").replace(/\./g, "."); // punto decimal
    }
  } else if (hasComma) {
    const after = s.split(",").pop() ?? "";
    s = after.length === 3 ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  } else if (hasDot) {
    const after = s.split(".").pop() ?? "";
    if (after.length === 3) s = s.replace(/\./g, ""); // 1.500 -> 1500 (miles)
    // else: decimal, se deja tal cual
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function slugFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface CartItem {
  id: string;
  client: string;
  description: string;
  price: number;
  qty: number;
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

// Conversión a CSV (boletas / productos) con Blob para evitar límites de data URI
export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
