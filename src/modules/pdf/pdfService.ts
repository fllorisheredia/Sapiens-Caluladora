import { jsPDF } from "jspdf";
import {
  type CalculationResult,
  type PeriodChartItem,
} from "../calculation/energyService";
import { type BillData } from "../../lib/validators";

export type ProposalPdfMode = "investment" | "service";

export interface ProposalPdfSummary {
  mode: ProposalPdfMode;
  title: string;
  badge: string;
  annualSavings: number;
  totalSavings25Years: number;
  upfrontCost: number;
  monthlyFee: number | null;
  annualMaintenance: number;
  paybackYears: number;
  recommendedPowerKwp: number;
  annualConsumptionKwh: number;
  description: string;
}

const COLORS = {
  bg: [248, 249, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  navy: [0, 0, 84] as [number, number, number],
  navyLight: [0, 0, 110] as [number, number, number],
  cyan: [84, 217, 199] as [number, number, number],
  sky: [148, 194, 255] as [number, number, number],
  mintSoft: [236, 250, 247] as [number, number, number],
  soft: [241, 246, 255] as [number, number, number],
  border: [222, 229, 238] as [number, number, number],
  text: [28, 28, 48] as [number, number, number],
  muted: [115, 113, 113] as [number, number, number],
  success: [84, 217, 199] as [number, number, number],
  shadow: [220, 228, 240] as [number, number, number],
  heroText: [220, 235, 250] as [number, number, number],
} as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

function setFill(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function setDraw(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}
function setText(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function drawShadow(doc: jsPDF, x: number, y: number, w: number, h: number, r = 6) {
  setFill(doc, COLORS.shadow);
  doc.roundedRect(x + 1, y + 1.5, w, h, r, r, "F");
}

function drawCard(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fill: readonly [number, number, number] = COLORS.white,
  stroke: readonly [number, number, number] = COLORS.border,
  radius = 5,
) {
  setFill(doc, fill);
  setDraw(doc, stroke);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, radius, radius, "FD");
}

function writeText(
  doc: jsPDF,
  text: string,
  x: number, y: number,
  options?: {
    size?: number;
    color?: readonly [number, number, number];
    fontStyle?: "normal" | "bold";
    maxWidth?: number;
    align?: "left" | "center" | "right";
  },
): string[] {
  const {
    size = 10,
    color = COLORS.text,
    fontStyle = "normal",
    maxWidth,
    align = "left",
  } = options || {};

  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(size);
  setText(doc, color);

  if (maxWidth) {
    const lines = doc.splitTextToSize(text || "-", maxWidth);
    doc.text(lines, x, y, { align });
    return lines as string[];
  }

  doc.text(text || "-", x, y, { align });
  return [text || "-"];
}

function getLines(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  size: number,
  fontStyle: "normal" | "bold" = "normal",
): string[] {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(size);
  return doc.splitTextToSize(text || "-", maxWidth) as string[];
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, title: string) {
  writeText(doc, title, x, y, { size: 8, color: COLORS.navy, fontStyle: "bold" });
  setFill(doc, COLORS.cyan);
  doc.roundedRect(x, y + 2, 20, 1.2, 0.6, 0.6, "F");
}

// ── Chip pill ─────────────────────────────────────────────────────────────────
function drawChip(
  doc: jsPDF, x: number, y: number,
  text: string, width = 28,
  fill: readonly [number, number, number] = COLORS.white,
) {
  drawCard(doc, x, y, width, 7, fill, COLORS.border, 3.5);
  writeText(doc, text, x + width / 2, y + 4.8, {
    size: 6.2,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
    maxWidth: width - 4,
  });
}

// ── KPI metric card ───────────────────────────────────────────────────────────
function drawMetricCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string,
  accent: readonly [number, number, number],
) {
  drawShadow(doc, x, y, w, h, 5);
  drawCard(doc, x, y, w, h, COLORS.white, COLORS.border, 5);

  // Accent bar
  setFill(doc, accent);
  doc.roundedRect(x + 3.5, y + 4, 2.2, h - 8, 1.1, 1.1, "F");

  writeText(doc, label, x + 8.5, y + 6.5, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
    maxWidth: w - 12,
  });

  writeText(doc, value, x + 8.5, y + 13.5, {
    size: 9,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 12,
  });
}

// ── Info rows (label + value) ─────────────────────────────────────────────────
function drawInfoRows(
  doc: jsPDF, x: number, y: number,
  rows: Array<[string, string]>,
  labelWidth: number, valueWidth: number,
) {
  let cy = y;
  rows.forEach(([label, value]) => {
    const lLines = getLines(doc, label, labelWidth, 6.5, "bold");
    const vSize = (value || "").length > 60 ? 5.9 : 6.5;
    const vLines = getLines(doc, value || "-", valueWidth, vSize);
    const lineCount = Math.max(lLines.length, vLines.length);
    const rowH = Math.max(9, lineCount * 3.8 + 2.5);

    writeText(doc, label, x, cy, { size: 6.5, color: COLORS.muted, fontStyle: "bold", maxWidth: labelWidth });
    writeText(doc, value || "-", x + labelWidth + 2, cy, { size: vSize, color: COLORS.navy, maxWidth: valueWidth });
    cy += rowH;
  });
}

// ── Recommendation item ───────────────────────────────────────────────────────
function drawRecommendationItem(
  doc: jsPDF, x: number, y: number, w: number,
  title: string, description: string, index: number,
) {
  drawCard(doc, x, y, w, 23, COLORS.soft, COLORS.border, 5);

  // Number badge
  drawCard(doc, x + 3, y + 3.5, 9, 9, COLORS.navy, COLORS.navy, 4.5);
  writeText(doc, String(index), x + 7.5, y + 9.3, {
    size: 7,
    color: COLORS.white,
    fontStyle: "bold",
    align: "center",
  });

  writeText(doc, title, x + 14.5, y + 7, {
    size: 6.8,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 18,
  });

  writeText(doc, description, x + 14.5, y + 12.5, {
    size: 5.8,
    color: COLORS.text,
    maxWidth: w - 18,
  });
}

// ── Period distribution bar chart ─────────────────────────────────────────────
function drawPeriodDistribution(
  doc: jsPDF, x: number, y: number, w: number,
  items: PeriodChartItem[],
) {
  let cy = y;
  const validItems = items.filter((i) => Number(i.percentage) > 0).slice(0, 6);

  validItems.forEach((item) => {
    writeText(doc, item.label, x, cy + 3.4, {
      size: 6.2,
      color: COLORS.navy,
      fontStyle: "bold",
    });

    const barArea = w - 28;
    drawCard(doc, x + 13, cy, barArea, 4.6, [235, 240, 248], [235, 240, 248], 2);

    const barW = Math.max(3, (barArea * item.percentage) / 100);
    setFill(doc, COLORS.cyan);
    doc.roundedRect(x + 13, cy, barW, 4.6, 2, 2, "F");

    writeText(doc, `${formatNumber(item.percentage, 1)}%`, x + w - 1, cy + 3.4, {
      size: 5.6,
      color: COLORS.muted,
      align: "right",
    });

    cy += 8.5;
  });
}

// ── Economic mini card ────────────────────────────────────────────────────────
function drawEconomicMiniCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string,
  fill: readonly [number, number, number] = COLORS.white,
) {
  drawCard(doc, x, y, w, h, fill, COLORS.border, 5);

  writeText(doc, label, x + w / 2, y + 7, {
    size: 6,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 6,
  });

  writeText(doc, value, x + w / 2, y + 16, {
    size: 8.5,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 6,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getModeAccent(mode: ProposalPdfMode) {
  return mode === "service" ? COLORS.sky : COLORS.cyan;
}

function getHeroSubtitle(mode: ProposalPdfMode) {
  return mode === "service"
    ? "Modelo pensado para reducir la entrada inicial, simplificar la contratación y ofrecer una cuota más predecible."
    : "Modelo orientado a maximizar el ahorro acumulado, acelerar la amortización y reforzar la rentabilidad a largo plazo.";
}

function getRecommendationItems(mode: ProposalPdfMode) {
  if (mode === "service") {
    return [
      {
        title: "Empezar a ahorrar con menor entrada",
        description: "La modalidad de servicio reduce la barrera inicial y facilita una adopción más cómoda del autoconsumo.",
      },
      {
        title: "Comparar cuota y ahorro estimado",
        description: "Conviene validar la cuota mensual frente al ahorro anual esperado para medir el equilibrio económico.",
      },
    ];
  }
  return [
    {
      title: "Maximizar el retorno de la inversión",
      description: "El nivel de consumo detectado hace atractiva una solución fotovoltaica orientada a capturar más ahorro acumulado.",
    },
    {
      title: "Revisar amortización y horizonte",
      description: "La inversión directa gana atractivo cuando el cliente prioriza rentabilidad, control del activo y ahorro sostenido.",
    },
  ];
}

function getConclusionText(proposal: ProposalPdfSummary) {
  return proposal.mode === "service"
    ? "La modalidad de servicio encaja bien cuando se busca una entrada más cómoda, una cuota mensual clara y una decisión de contratación más flexible."
    : "La modalidad de inversión encaja mejor cuando se prioriza el ahorro acumulado, la amortización de la instalación y la rentabilidad a medio y largo plazo.";
}

function drawEconomicSummary(
  doc: jsPDF, x: number, y: number, w: number,
  proposal: ProposalPdfSummary,
) {
  const gap = 3.5;
  const cardW = (w - gap * 2) / 3;
  const cardH = 26;

  if (proposal.mode === "service") {
    drawEconomicMiniCard(doc, x, y, cardW, cardH, "Cuota mensual",
      proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes` : "Consultar",
      COLORS.mintSoft);
    drawEconomicMiniCard(doc, x + cardW + gap, y, cardW, cardH,
      "Ahorro anual", formatCurrency(proposal.annualSavings));
    drawEconomicMiniCard(doc, x + (cardW + gap) * 2, y, cardW, cardH,
      "Ahorro 25 años", formatCurrency(proposal.totalSavings25Years));

    writeText(doc,
      "Modalidad pensada para una incorporación más suave al autoconsumo, manteniendo visibilidad económica desde el primer momento.",
      x, y + cardH + 7,
      { size: 6, color: COLORS.muted, maxWidth: w });
  } else {
    drawEconomicMiniCard(doc, x, y, cardW, cardH, "Inversión inicial",
      formatCurrency(proposal.upfrontCost), COLORS.mintSoft);
    drawEconomicMiniCard(doc, x + cardW + gap, y, cardW, cardH,
      "Ahorro anual", formatCurrency(proposal.annualSavings));
    drawEconomicMiniCard(doc, x + (cardW + gap) * 2, y, cardW, cardH,
      "Payback",
      proposal.paybackYears > 0 ? `${formatNumber(proposal.paybackYears, 1)} años` : "N/D");

    writeText(doc,
      "Modalidad enfocada en consolidar un mayor ahorro acumulado y aprovechar mejor el retorno económico de la instalación.",
      x, y + cardH + 7,
      { size: 6, color: COLORS.muted, maxWidth: w });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export const generateStudyPDF = (
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const margin = 10;
  const innerW = PW - margin * 2; // 190

  // ── Safe values ─────────────────────────────────────────────────────────────
  // Fit the full name on one line: truncate if necessary
  const rawName = `${data.name || ""} ${data.lastName || ""}`.trim() || "Cliente";
  const safeName = rawName.length > 38 ? rawName.slice(0, 36) + "…" : rawName;

  const viabilityLabel =
    result.viabilityScore >= 75 ? "Alta" : result.viabilityScore >= 50 ? "Media" : "Baja";
  const modeAccent = getModeAccent(proposal.mode);

  // ── Background ───────────────────────────────────────────────────────────────
  setFill(doc, COLORS.bg);
  doc.rect(0, 0, PW, PH, "F");

  // ── TOP ACCENT LINE ──────────────────────────────────────────────────────────
  setFill(doc, COLORS.navy);
  doc.rect(0, 0, PW, 2.5, "F");

  // ── HEADER ───────────────────────────────────────────────────────────────────
  // Left: brand
  writeText(doc, "SAPIENS ENERGÍA", margin, 11, {
    size: 6.8,
    color: COLORS.muted,
    fontStyle: "bold",
  });
  writeText(doc, "PROPUESTA ENERGÉTICA", margin, 18, {
    size: 12,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  // Right: date pill
  drawCard(doc, 163, 8, 37, 12, COLORS.white, COLORS.border, 4);
  writeText(doc, "FECHA", 181.5, 12.5, {
    size: 5.5,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, new Date().toLocaleDateString("es-ES"), 181.5, 17.5, {
    size: 7.5,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
  });

  // Thin divider
  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, 23, PW - margin, 23);

  // ── HERO BAND ────────────────────────────────────────────────────────────────
  const heroY = 26;
  const heroH = 34;

  drawShadow(doc, margin, heroY, innerW, heroH, 7);
  drawCard(doc, margin, heroY, innerW, heroH, COLORS.white, COLORS.border, 7);

  // Dark navy left panel
  setFill(doc, COLORS.navy);
  doc.roundedRect(margin, heroY, 76, heroH, 7, 7, "F");
  // Fill right side of rounded rect to make square right edge
  doc.rect(margin + 70, heroY, 6, heroH, "F");

  // Hero text
  writeText(doc, "INFORME EJECUTIVO", margin + 5, heroY + 7.5, {
    size: 6.5,
    color: COLORS.sky,
    fontStyle: "bold",
  });

  const heroTitle =
    proposal.mode === "service"
      ? "Propuesta energética\nmodalidad servicio"
      : "Propuesta energética\nmodalidad inversión";

  writeText(doc, heroTitle, margin + 5, heroY + 14, {
    size: 13,
    color: COLORS.white,
    fontStyle: "bold",
    maxWidth: 64,
  });

  writeText(doc, getHeroSubtitle(proposal.mode), margin + 5, heroY + 27, {
    size: 5.7,
    color: COLORS.heroText,
    maxWidth: 64,
  });

  // Right side chips row
  const chipY = heroY + 5;
  drawChip(doc, 90, chipY, data.billType || "2TD", 27);
  drawChip(doc, 120, chipY, proposal.mode === "service" ? "Servicio" : "Inversión", 28);
  drawChip(doc, 151, chipY, proposal.badge || "Ahorro", 29, COLORS.mintSoft);

  // Viability box
  drawCard(doc, 150, heroY + 16, 40, 16, COLORS.mintSoft, COLORS.border, 5);
  writeText(doc, "VIABILIDAD SOLAR", 170, heroY + 21, {
    size: 5.5,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, String(result.viabilityScore), 170, heroY + 28, {
    size: 13,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, viabilityLabel, 170, heroY + 31.5, {
    size: 6.5,
    color: COLORS.success,
    fontStyle: "bold",
    align: "center",
  });

  // ── KPI ROW ───────────────────────────────────────────────────────────────────
  const kpiY = heroY + heroH + 5;
  const kpiH = 17;
  const kpiW = 45;
  const kpiGap = (innerW - kpiW * 4) / 3;

  drawMetricCard(doc, margin, kpiY, kpiW, kpiH,
    "CONSUMO MENSUAL",
    `${formatNumber(result.averageMonthlyConsumptionKwh)} kWh`,
    modeAccent);

  drawMetricCard(doc, margin + kpiW + kpiGap, kpiY, kpiW, kpiH,
    proposal.mode === "service" ? "CUOTA MENSUAL" : "COSTE ANUAL",
    proposal.mode === "service"
      ? (proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes` : "Consultar")
      : formatCurrency(result.estimatedAnnualEnergyCost),
    modeAccent);

  drawMetricCard(doc, margin + (kpiW + kpiGap) * 2, kpiY, kpiW, kpiH,
    "AHORRO ANUAL",
    formatCurrency(proposal.annualSavings),
    modeAccent);

  drawMetricCard(doc, margin + (kpiW + kpiGap) * 3, kpiY, kpiW, kpiH,
    proposal.mode === "service" ? "AHORRO 25 AÑOS" : "PAYBACK",
    proposal.mode === "service"
      ? formatCurrency(proposal.totalSavings25Years)
      : (proposal.paybackYears > 0 ? `${formatNumber(proposal.paybackYears, 1)} años` : "N/D"),
    COLORS.sky);

  // ── MIDDLE ROW: Supply + Recommendations ──────────────────────────────────────
  const midY = kpiY + kpiH + 5;
  const midH = 70;
  const leftW = 84;
  const rightW = innerW - leftW - 4;

  // Supply data card
  drawShadow(doc, margin, midY, leftW, midH);
  drawCard(doc, margin, midY, leftW, midH, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, margin + 4, midY + 8, "DATOS DEL SUMINISTRO");

  drawInfoRows(
    doc, margin + 4, midY + 16,
    [
      ["Titular", safeName],
      ["CUPS", data.cups || "-"],
      ["Tarifa", data.billType || "-"],
      ["Dirección", data.address || "-"],
      ["Email", data.email || "-"],
      ["IBAN", data.iban || "-"],
    ],
    19, 47,
  );

  // Recommendations card
  const recX = margin + leftW + 4;
  drawShadow(doc, recX, midY, rightW, midH);
  drawCard(doc, recX, midY, rightW, midH, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, recX + 4, midY + 8, "RECOMENDACIONES PRIORITARIAS");

  const recs = getRecommendationItems(proposal.mode);
  drawRecommendationItem(doc, recX + 4, midY + 16, rightW - 8, recs[0].title, recs[0].description, 1);
  drawRecommendationItem(doc, recX + 4, midY + 42, rightW - 8, recs[1].title, recs[1].description, 2);

  // ── BOTTOM ROW: Economic + Technical ─────────────────────────────────────────
  const botY = midY + midH + 5;
  const botH = 54;
  const econW = 95;
  const techW = innerW - econW - 4;

  // Economic summary card
  drawShadow(doc, margin, botY, econW, botH);
  drawCard(doc, margin, botY, econW, botH, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, margin + 4, botY + 8, "RESUMEN ECONÓMICO");
  drawEconomicSummary(doc, margin + 4, botY + 16, econW - 8, proposal);

  // Technical profile card
  const techX = margin + econW + 4;
  drawShadow(doc, techX, botY, techW, botH);
  drawCard(doc, techX, botY, techW, botH, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, techX + 4, botY + 8, "PERFIL TÉCNICO");

  writeText(doc, "Distribución del consumo", techX + 4, botY + 16, {
    size: 6, color: COLORS.muted, fontStyle: "bold",
  });
  drawPeriodDistribution(doc, techX + 4, botY + 21, 38, result.charts.periodDistribution);

  writeText(doc, "Potencia y producción", techX + 48, botY + 16, {
    size: 6, color: COLORS.muted, fontStyle: "bold",
  });
  drawInfoRows(
    doc, techX + 48, botY + 22,
    [
      ["Potencia", `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`],
      ["Cons. anual", `${formatNumber(proposal.annualConsumptionKwh)} kWh`],
      ["Prod. anual", `${formatNumber(result.estimatedAnnualProductionKwh)} kWh`],
      ["Autocons.", `${formatNumber(result.selfConsumptionRatio * 100, 0)} %`],
    ],
    17, 20,
  );

  // ── CONCLUSION ────────────────────────────────────────────────────────────────
  const concY = botY + botH + 5;
  const concH = 46;

  drawShadow(doc, margin, concY, innerW, concH, 7);
  drawCard(doc, margin, concY, innerW, concH, COLORS.white, COLORS.border, 7);
  drawSectionTitle(doc, margin + 4, concY + 8, "CONCLUSIÓN EJECUTIVA");

  // Summary sub-card
  drawCard(doc, margin + 4, concY + 14, 85, 25, COLORS.soft, COLORS.border, 5);
  writeText(doc, "Resumen", margin + 8, concY + 20.5, {
    size: 7, color: COLORS.navy, fontStyle: "bold",
  });
  writeText(doc, getConclusionText(proposal), margin + 8, concY + 27, {
    size: 5.9, color: COLORS.text, maxWidth: 75,
  });

  // Metric highlight 1
  drawCard(doc, margin + 94, concY + 14, 45, 25, COLORS.mintSoft, COLORS.border, 5);
  writeText(
    doc,
    proposal.mode === "service" ? "Cuota estimada" : "Ahorro anual",
    margin + 116.5, concY + 21,
    { size: 6, color: COLORS.muted, fontStyle: "bold", align: "center" },
  );
  writeText(
    doc,
    proposal.mode === "service"
      ? (proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : formatCurrency(proposal.annualSavings))
      : formatCurrency(proposal.annualSavings),
    margin + 116.5, concY + 30,
    { size: 9.5, color: COLORS.navy, fontStyle: "bold", align: "center", maxWidth: 39 },
  );
  writeText(doc, "estimado", margin + 116.5, concY + 35, {
    size: 5.7, color: COLORS.muted, align: "center",
  });

  // Metric highlight 2
  drawCard(doc, margin + 143, concY + 14, 47, 25, COLORS.white, COLORS.border, 5);
  writeText(doc, "Modalidad", margin + 166.5, concY + 21, {
    size: 6, color: COLORS.muted, fontStyle: "bold", align: "center",
  });
  writeText(
    doc,
    proposal.mode === "service" ? "Servicio" : "Inversión",
    margin + 166.5, concY + 30,
    { size: 9.5, color: COLORS.navy, fontStyle: "bold", align: "center" },
  );
  writeText(doc, proposal.badge || viabilityLabel, margin + 166.5, concY + 35, {
    size: 6, color: COLORS.success, fontStyle: "bold", align: "center",
  });

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  // Bottom accent
  setFill(doc, COLORS.navy);
  doc.rect(0, PH - 2.5, PW, 2.5, "F");

  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, PH - 14, PW - margin, PH - 14);

  writeText(
    doc,
    "Propuesta generada automáticamente por Sapiens Energía a partir del análisis documental de la factura del cliente.",
    PW / 2, PH - 9,
    { size: 5.6, color: COLORS.muted, align: "center", maxWidth: 160 },
  );

  return doc;
};

export const getStudyPdfBase64 = (
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
): string => {
  const doc = generateStudyPDF(data, result, proposal);
  return doc.output("datauristring");
};