// Configuración de boleta personalizable (portado del modelo de Moon POS).
// Se persiste por tenant en localStorage (igual que Moon) hasta migrar a Supabase.

export interface ReceiptConfig {
  businessName: string;
  thanksText: string;
  accountInfo: string;
  showLogo: boolean;
  showAccount: boolean;
  bgColor: string;
  textColor: string;
  borderColor: string;
  fontWeight: string;
  fontSize: string;
  logo: string; // dataURL
  theme: string;
  mode: string;
}

export const RECEIPT_DEFAULTS: ReceiptConfig = {
  businessName: "SmartPOS",
  thanksText: "Gracias por su compra · SmartPOS",
  accountInfo: "",
  showLogo: false,
  showAccount: false,
  bgColor: "#ffffff",
  textColor: "#111111",
  borderColor: "#999999",
  fontWeight: "400",
  fontSize: "13",
  logo: "",
  theme: "ocean",
  mode: "auto",
};

const key = (tenantId?: string) => `smartpos_receipt_${tenantId ?? "default"}`;

export function loadReceiptConfig(tenantId?: string): ReceiptConfig {
  try {
    const raw = localStorage.getItem(key(tenantId));
    if (raw) return { ...RECEIPT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...RECEIPT_DEFAULTS };
}

export function saveReceiptConfig(cfg: ReceiptConfig, tenantId?: string): void {
  try {
    localStorage.setItem(key(tenantId), JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

// Genera el HTML imprimible de la boleta (estilo Moon POS).
export function renderBoletaHtml(
  sale: { id: string; created_at: string; customer_name: string | null; items: { description: string; price: number; qty: number }[]; total: number },
  cfg: ReceiptConfig
): string {
  const fs = parseFloat(cfg.fontSize) || 13;
  const fw = parseInt(cfg.fontWeight, 10) || 400;
  const border = `border-bottom:1px dashed ${cfg.borderColor}`;
  const borderTop = `border-top:1px dashed ${cfg.borderColor}`;
  const safeName = escapeHtml(sale.customer_name ?? "Sin cliente");
  const logoHtml = cfg.showLogo && cfg.logo
    ? `<img src="${cfg.logo}" alt="logo" style="max-height:54px;margin:0 auto 6px;display:block" />`
    : "";
  const accountHtml = cfg.showAccount && cfg.accountInfo
    ? `<p style="margin-top:4px">${escapeHtml(cfg.accountInfo).replace(/\n/g, "<br/>")}</p>`
    : "";
  const itemsHtml = sale.items
    .map(
      (i) =>
        `<div style="display:flex;justify-content:space-between;gap:8px;margin:3px 0"><span>${escapeHtml(i.description)} <span style="opacity:.6">x${i.qty}</span></span><span>${fmtCLP(i.price * i.qty)}</span></div>`
    )
    .join("");
  const total = sale.items.reduce((a, i) => a + i.price * i.qty, 0);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta ${sale.id.slice(0, 8)}</title>
<style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}button{display:none}}.rc{width:340px;margin:18px auto;padding:14px;background:${cfg.bgColor};color:${cfg.textColor};font-family:system-ui,Arial,sans-serif;font-size:${fs}px;font-weight:${fw};border:1px solid ${cfg.borderColor};border-radius:10px}.brand{text-align:center;font-weight:${Math.min(800, fw + 200)};font-size:${fs + 3}px;margin-bottom:2px}.c{text-align:center}.row{display:flex;justify-content:space-between}.tot{font-weight:${Math.min(900, fw + 300)};font-size:${fs + 4}px;margin-top:8px;padding-top:6px;${borderTop}}button{margin-top:14px;width:100%;padding:9px;background:${cfg.borderColor};color:${cfg.bgColor};border:0;border-radius:8px;cursor:pointer}</style></head>
<body><div class="rc">
<div class="c">${logoHtml}<div class="brand">${escapeHtml(cfg.businessName)}</div>
<p class="c" style="margin-bottom:10px;${border}">Boleta de venta</p>
<div class="row" style="${border};padding-bottom:5px;margin-bottom:5px"><span>Cliente: ${safeName}</span><span>#${sale.id.slice(0, 8)}</span></div>
<div style="margin-bottom:6px"><div class="c" style="font-size:${fs - 1}px;opacity:.7;margin-bottom:6px">${fmtDate(sale.created_at)}</div>${itemsHtml}</div>
<div class="tot row"><span>TOTAL</span><span>${fmtCLP(total)}</span></div>
<p class="c" style="margin-top:12px;${borderTop};padding-top:8px;line-height:1.7">${escapeHtml(cfg.thanksText)}</p>
${accountHtml}
</div>
<button onclick="window.print()">Imprimir / Guardar PDF</button>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
}
