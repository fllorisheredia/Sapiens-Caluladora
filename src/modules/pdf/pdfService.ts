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
  warning: [255, 214, 102] as [number, number, number],
  shadow: [220, 228, 240] as [number, number, number],
  heroText: [220, 235, 250] as [number, number, number],
} as const;

type AnyRecord = Record<string, unknown>;

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

function toRecord(value: unknown): AnyRecord {
  if (value && typeof value === "object") {
    return value as AnyRecord;
  }
  return {};
}

function readNumber(source: AnyRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = Number(
        value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
      );
      if (Number.isFinite(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function readString(source: AnyRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function drawShadow(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 6,
) {
  setFill(doc, COLORS.shadow);
  doc.roundedRect(x + 1, y + 1.5, w, h, r, r, "F");
}

function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
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
  x: number,
  y: number,
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
  writeText(doc, title, x, y, {
    size: 8,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  setFill(doc, COLORS.cyan);
  doc.roundedRect(x, y + 2, 20, 1.2, 0.6, 0.6, "F");
}

function drawChip(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  width = 28,
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

function drawMetricCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  accent: readonly [number, number, number],
) {
  drawShadow(doc, x, y, w, h, 5);
  drawCard(doc, x, y, w, h, COLORS.white, COLORS.border, 5);

  setFill(doc, accent);
  doc.roundedRect(x + 3.5, y + 4, 2.2, h - 8, 1.1, 1.1, "F");

  writeText(doc, label, x + 8.5, y + 6.5, {
    size: 5.6,
    color: COLORS.muted,
    fontStyle: "bold",
    maxWidth: w - 12,
  });

  writeText(doc, value, x + 8.5, y + 13.2, {
    size: 8.3,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 12,
  });
}

function drawInfoRows(
  doc: jsPDF,
  x: number,
  y: number,
  rows: Array<[string, string]>,
  labelWidth: number,
  valueWidth: number,
  options?: {
    labelSize?: number;
    valueSize?: number;
    minValueSize?: number;
    lineHeight?: number;
    minRowHeight?: number;
  },
) {
  const {
    labelSize = 6.1,
    valueSize = 6.1,
    minValueSize = 5.4,
    lineHeight = 3.1,
    minRowHeight = 6.5,
  } = options || {};

  let cy = y;

  rows.forEach(([label, value]) => {
    const safeValue = value || "-";
    const currentValueSize =
      safeValue.length > 75
        ? Math.max(minValueSize, valueSize - 1)
        : safeValue.length > 50
          ? Math.max(minValueSize, valueSize - 0.5)
          : valueSize;

    const lLines = getLines(doc, label, labelWidth, labelSize, "bold");
    const vLines = getLines(doc, safeValue, valueWidth, currentValueSize);
    const lineCount = Math.max(lLines.length, vLines.length);
    const rowH = Math.max(minRowHeight, lineCount * lineHeight + 1.8);

    writeText(doc, label, x, cy, {
      size: labelSize,
      color: COLORS.muted,
      fontStyle: "bold",
      maxWidth: labelWidth,
    });

    writeText(doc, safeValue, x + labelWidth + 2, cy, {
      size: currentValueSize,
      color: COLORS.navy,
      maxWidth: valueWidth,
    });

    cy += rowH;
  });
}

function drawRecommendationItem(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  description: string,
  index: number,
  h = 20,
) {
  drawCard(doc, x, y, w, h, COLORS.soft, COLORS.border, 5);

  drawCard(doc, x + 3, y + 3.2, 9, 9, COLORS.navy, COLORS.navy, 4.5);
  writeText(doc, String(index), x + 7.5, y + 9.1, {
    size: 7,
    color: COLORS.white,
    fontStyle: "bold",
    align: "center",
  });

  writeText(doc, title, x + 14.5, y + 6.6, {
    size: 6.4,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 18,
  });

  writeText(doc, description, x + 14.5, y + 11.8, {
    size: 5.4,
    color: COLORS.text,
    maxWidth: w - 18,
  });
}

function drawPeriodDistribution(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  items: PeriodChartItem[],
  options?: {
    maxItems?: number;
    barHeight?: number;
    rowGap?: number;
  },
) {
  const { maxItems = 3, barHeight = 4.2, rowGap = 7.2 } = options || {};
  let cy = y;
  const validItems = items.filter((i) => Number(i.percentage) > 0).slice(0, maxItems);

  validItems.forEach((item) => {
    writeText(doc, item.label, x, cy + 3.2, {
      size: 5.8,
      color: COLORS.navy,
      fontStyle: "bold",
    });

    const barArea = w - 24;
    drawCard(
      doc,
      x + 11,
      cy,
      barArea,
      barHeight,
      [235, 240, 248],
      [235, 240, 248],
      2,
    );

    const barW = Math.max(2.5, (barArea * item.percentage) / 100);
    setFill(doc, COLORS.cyan);
    doc.roundedRect(x + 11, cy, barW, barHeight, 2, 2, "F");

    writeText(doc, `${formatNumber(item.percentage, 1)}%`, x + w, cy + 3.2, {
      size: 5.1,
      color: COLORS.muted,
      align: "right",
    });

    cy += rowGap;
  });
}

function drawEconomicMiniCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  fill: readonly [number, number, number] = COLORS.white,
) {
  drawCard(doc, x, y, w, h, fill, COLORS.border, 5);

  writeText(doc, label, x + w / 2, y + 6.5, {
    size: 5.6,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 5,
  });

  writeText(doc, value, x + w / 2, y + 14.7, {
    size: 7.8,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 5,
  });
}

function drawHighlightPill(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  accent: readonly [number, number, number],
) {
  drawCard(doc, x, y, w, 10, COLORS.soft, COLORS.border, 4.5);
  drawCard(doc, x + 3, y + 2.1, 5.8, 5.8, accent, accent, 2.9);
  writeText(doc, "•", x + 5.9, y + 5.8, {
    size: 8,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, text, x + 11.3, y + 6.4, {
    size: 5.8,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 14,
  });
}

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
        title: "Reducir la barrera de entrada",
        description:
          "La modalidad de servicio permite empezar sin un desembolso inicial elevado y con una cuota más previsible.",
      },
      {
        title: "Equilibrar cuota y ahorro",
        description:
          "Conviene revisar la relación entre cuota mensual, ahorro anual y horizonte esperado para validar la propuesta.",
      },
    ];
  }

  return [
    {
      title: "Maximizar el retorno de la inversión",
      description:
        "El nivel de consumo detectado hace atractiva una solución fotovoltaica orientada a capturar más ahorro acumulado.",
    },
    {
      title: "Priorizar rentabilidad a largo plazo",
      description:
        "La inversión directa gana valor cuando se busca mayor ahorro total, control del activo y amortización sostenida.",
    },
  ];
}

function getConclusionText(proposal: ProposalPdfSummary) {
  return proposal.mode === "service"
    ? "La modalidad de servicio encaja bien cuando se busca una entrada más cómoda, una cuota mensual clara y una decisión de contratación más flexible."
    : "La modalidad de inversión encaja mejor cuando se prioriza el ahorro acumulado, la amortización de la instalación y la rentabilidad a medio y largo plazo.";
}

function normalizeProposalInput(
  proposalInput: ProposalPdfSummary | ProposalPdfSummary[],
): ProposalPdfSummary[] {
  if (Array.isArray(proposalInput)) {
    return proposalInput.filter(Boolean);
  }

  return proposalInput ? [proposalInput] : [];
}

function getCustomerFullName(data: BillData): string {
  const raw = toRecord(data);

  const fullName =
    readString(raw, ["fullName", "customerFullName"]) ||
    [
      readString(raw, ["name", "firstName", "nombre"]) || "",
      readString(raw, ["lastName", "lastname", "surname", "apellidos"]) || "",
      readString(raw, ["lastname2", "secondSurname", "apellido2"]) || "",
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const finalName = fullName || "Cliente";
  return finalName.length > 42 ? `${finalName.slice(0, 40)}…` : finalName;
}

function getAnnualConsumptionFromInvoice(
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
): number {
  const raw = toRecord(data);

  const explicitAnnual = readNumber(raw, [
    "annualConsumptionKwh",
    "consumptionAnnualKwh",
    "estimatedAnnualConsumptionKwh",
    "extractedAnnualConsumptionKwh",
  ]);
  if (explicitAnnual && explicitAnnual > 0) {
    return explicitAnnual;
  }

  const monthly = readNumber(raw, [
    "averageMonthlyConsumptionKwh",
    "monthlyConsumptionKwh",
  ]);
  if (monthly && monthly > 0) {
    return monthly * 12;
  }

  if (proposal.annualConsumptionKwh > 0) {
    return proposal.annualConsumptionKwh;
  }

  if (Number.isFinite(result.averageMonthlyConsumptionKwh)) {
    return result.averageMonthlyConsumptionKwh * 12;
  }

  return 0;
}

function getContractedPowerText(data: BillData): string {
  const raw = toRecord(data);

  const single = readNumber(raw, [
    "contractedPowerKw",
    "contractedPower",
    "powerKw",
    "power",
    "potenciaContratada",
    "potenciaContratadaKw",
  ]);

  if (single && single > 0) {
    return `${formatNumber(single, 2)} kW`;
  }

  const p1 = readNumber(raw, [
    "contractedPowerP1",
    "contractedPowerP1Kw",
    "powerP1",
    "powerP1Kw",
    "potenciaContratadaP1",
    "potenciaP1",
  ]);

  const p2 = readNumber(raw, [
    "contractedPowerP2",
    "contractedPowerP2Kw",
    "powerP2",
    "powerP2Kw",
    "potenciaContratadaP2",
    "potenciaP2",
  ]);

  if (p1 && p2) {
    return `P1: ${formatNumber(p1, 2)} kW · P2: ${formatNumber(p2, 2)} kW`;
  }

  if (p1) {
    return `P1: ${formatNumber(p1, 2)} kW`;
  }

  if (p2) {
    return `P2: ${formatNumber(p2, 2)} kW`;
  }

  return "-";
}

function getSupplyRows(
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
): Array<[string, string]> {
  const annualConsumptionFromInvoice = getAnnualConsumptionFromInvoice(
    data,
    result,
    proposal,
  );

  return [
    ["Titular", getCustomerFullName(data)],
    ["CUPS", data.cups || "-"],
    ["Tarifa", data.billType || "-"],
    ["Dirección", data.address || "-"],
    ["Email", data.email || "-"],
    ["IBAN", data.iban || "-"],
    [
      "Consumo anual factura",
      annualConsumptionFromInvoice > 0
        ? `${formatNumber(annualConsumptionFromInvoice, 0)} kWh`
        : "-",
    ],
    ["Potencia contratada", getContractedPowerText(data)],
  ];
}

function drawEconomicSummary(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  proposal: ProposalPdfSummary,
) {
  const gap = 3;
  const cardW = (w - gap * 2) / 3;
  const cardH = 20;

  if (proposal.mode === "service") {
    drawEconomicMiniCard(
      doc,
      x,
      y,
      cardW,
      cardH,
      "Ahorro anual",
      formatCurrency(proposal.annualSavings),
      COLORS.mintSoft,
    );
    drawEconomicMiniCard(
      doc,
      x + cardW + gap,
      y,
      cardW,
      cardH,
      "Cuota mensual",
      proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar",
    );
    drawEconomicMiniCard(
      doc,
      x + (cardW + gap) * 2,
      y,
      cardW,
      cardH,
      "Ahorro total",
      formatCurrency(proposal.totalSavings25Years),
    );

    drawHighlightPill(
      doc,
      x,
      y + 24,
      w,
      "Sin desembolso inicial elevado",
      COLORS.cyan,
    );
    drawHighlightPill(
      doc,
      x,
      y + 36,
      w,
      "Cuota mensual fija y predecible",
      COLORS.sky,
    );
  } else {
    drawEconomicMiniCard(
      doc,
      x,
      y,
      cardW,
      cardH,
      "Ahorro anual",
      formatCurrency(proposal.annualSavings),
      COLORS.mintSoft,
    );
    drawEconomicMiniCard(
      doc,
      x + cardW + gap,
      y,
      cardW,
      cardH,
      "Coste inicial",
      formatCurrency(proposal.upfrontCost),
    );
    drawEconomicMiniCard(
      doc,
      x + (cardW + gap) * 2,
      y,
      cardW,
      cardH,
      "Ahorro total",
      formatCurrency(proposal.totalSavings25Years),
    );

    drawHighlightPill(
      doc,
      x,
      y + 24,
      w,
      "Mayor ahorro acumulado a largo plazo",
      COLORS.cyan,
    );
    drawHighlightPill(
      doc,
      x,
      y + 36,
      w,
      "Más control sobre la rentabilidad del proyecto",
      COLORS.sky,
    );
  }
}

function renderPageChrome(
  doc: jsPDF,
  title: string,
  pageIndex: number,
  totalPages: number,
) {
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const margin = 10;

  setFill(doc, COLORS.bg);
  doc.rect(0, 0, PW, PH, "F");

  setFill(doc, COLORS.navy);
  doc.rect(0, 0, PW, 2.5, "F");

  writeText(doc, "SAPIENS ENERGÍA", margin, 11, {
    size: 6.8,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  writeText(doc, title, margin, 18, {
    size: 12,
    color: COLORS.navy,
    fontStyle: "bold",
  });

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

  if (totalPages > 1) {
    drawCard(doc, 136, 8, 23, 12, COLORS.mintSoft, COLORS.border, 4);
    writeText(doc, `${pageIndex + 1}/${totalPages}`, 147.5, 15.5, {
      size: 7,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
    });
  }

  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, 23, PW - margin, 23);

  setFill(doc, COLORS.navy);
  doc.rect(0, PH - 2.5, PW, 2.5, "F");

  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, PH - 14, PW - margin, PH - 14);

  writeText(
    doc,
    "Propuesta generada automáticamente por Sapiens Energía a partir del análisis documental de la factura del cliente.",
    PW / 2,
    PH - 9,
    {
      size: 5.6,
      color: COLORS.muted,
      align: "center",
      maxWidth: 160,
    },
  );
}

function renderStudyPdfPage(
  doc: jsPDF,
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
  pageIndex: number,
  totalPages: number,
) {
  const PW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const innerW = PW - margin * 2;

  const viabilityLabel =
    result.viabilityScore >= 75
      ? "Alta"
      : result.viabilityScore >= 50
        ? "Media"
        : "Baja";

  const modeAccent = getModeAccent(proposal.mode);

  renderPageChrome(doc, "PROPUESTA ENERGÉTICA", pageIndex, totalPages);

  const heroY = 26;
  const heroH = 34;

  drawShadow(doc, margin, heroY, innerW, heroH, 7);
  drawCard(doc, margin, heroY, innerW, heroH, COLORS.white, COLORS.border, 7);

  setFill(doc, COLORS.navy);
  doc.roundedRect(margin, heroY, 76, heroH, 7, 7, "F");
  doc.rect(margin + 70, heroY, 6, heroH, "F");

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

  const chipY = heroY + 5;
  drawChip(doc, 90, chipY, data.billType || "2TD", 27);
  drawChip(
    doc,
    120,
    chipY,
    proposal.mode === "service" ? "Servicio" : "Inversión",
    28,
  );
  drawChip(doc, 151, chipY, proposal.badge || "Ahorro", 29, COLORS.mintSoft);

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

  const kpiY = heroY + heroH + 5;
  const kpiH = 17;
  const kpiW = 45;
  const kpiGap = (innerW - kpiW * 4) / 3;

  if (proposal.mode === "investment") {
    drawMetricCard(
      doc,
      margin,
      kpiY,
      kpiW,
      kpiH,
      "COSTE INICIAL",
      formatCurrency(proposal.upfrontCost),
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + kpiW + kpiGap,
      kpiY,
      kpiW,
      kpiH,
      "RETORNO",
      proposal.paybackYears > 0
        ? `${formatNumber(proposal.paybackYears, 1)} años`
        : "N/D",
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + (kpiW + kpiGap) * 2,
      kpiY,
      kpiW,
      kpiH,
      "POTENCIA RECOM.",
      `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`,
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + (kpiW + kpiGap) * 3,
      kpiY,
      kpiW,
      kpiH,
      "CONSUMO ANUAL",
      `${formatNumber(proposal.annualConsumptionKwh, 0)} kWh`,
      COLORS.sky,
    );
  } else {
    drawMetricCard(
      doc,
      margin,
      kpiY,
      kpiW,
      kpiH,
      "CUOTA MENSUAL",
      proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar",
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + kpiW + kpiGap,
      kpiY,
      kpiW,
      kpiH,
      "AHORRO ANUAL",
      formatCurrency(proposal.annualSavings),
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + (kpiW + kpiGap) * 2,
      kpiY,
      kpiW,
      kpiH,
      "POTENCIA RECOM.",
      `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`,
      modeAccent,
    );

    drawMetricCard(
      doc,
      margin + (kpiW + kpiGap) * 3,
      kpiY,
      kpiW,
      kpiH,
      "CONSUMO ANUAL",
      `${formatNumber(proposal.annualConsumptionKwh, 0)} kWh`,
      COLORS.sky,
    );
  }

  const gridY = kpiY + kpiH + 5;
  const gridGap = 4;
  const gridCardW = (innerW - gridGap) / 2;
  const gridCardH = 65;

  // DATOS DEL SUMINISTRO
  drawShadow(doc, margin, gridY, gridCardW, gridCardH);
  drawCard(
    doc,
    margin,
    gridY,
    gridCardW,
    gridCardH,
    COLORS.white,
    COLORS.border,
    6,
  );
  drawSectionTitle(doc, margin + 4, gridY + 8, "DATOS DEL SUMINISTRO");

  drawInfoRows(
    doc,
    margin + 4,
    gridY + 16,
    getSupplyRows(data, result, proposal),
    22,
    gridCardW - 32,
    {
      labelSize: 5.8,
      valueSize: 5.8,
      minValueSize: 5.2,
      lineHeight: 2.9,
      minRowHeight: 6.2,
    },
  );

  // RECOMENDACIONES PRIORITARIAS
  const rightX = margin + gridCardW + gridGap;
  drawShadow(doc, rightX, gridY, gridCardW, gridCardH);
  drawCard(
    doc,
    rightX,
    gridY,
    gridCardW,
    gridCardH,
    COLORS.white,
    COLORS.border,
    6,
  );
  drawSectionTitle(doc, rightX + 4, gridY + 8, "RECOMENDACIONES PRIORITARIAS");

  const recs = getRecommendationItems(proposal.mode);
  drawRecommendationItem(
    doc,
    rightX + 4,
    gridY + 16,
    gridCardW - 8,
    recs[0].title,
    recs[0].description,
    1,
    20,
  );
  drawRecommendationItem(
    doc,
    rightX + 4,
    gridY + 39,
    gridCardW - 8,
    recs[1].title,
    recs[1].description,
    2,
    20,
  );

  // RESUMEN ECONÓMICO
  const bottomY = gridY + gridCardH + gridGap;
  drawShadow(doc, margin, bottomY, gridCardW, gridCardH);
  drawCard(
    doc,
    margin,
    bottomY,
    gridCardW,
    gridCardH,
    COLORS.white,
    COLORS.border,
    6,
  );
  drawSectionTitle(doc, margin + 4, bottomY + 8, "RESUMEN ECONÓMICO");
  drawEconomicSummary(doc, margin + 4, bottomY + 16, gridCardW - 8, proposal);

  // PERFIL TÉCNICO
  drawShadow(doc, rightX, bottomY, gridCardW, gridCardH);
  drawCard(
    doc,
    rightX,
    bottomY,
    gridCardW,
    gridCardH,
    COLORS.white,
    COLORS.border,
    6,
  );
  drawSectionTitle(doc, rightX + 4, bottomY + 8, "PERFIL TÉCNICO");

  writeText(doc, "Distribución del consumo", rightX + 4, bottomY + 16, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  drawPeriodDistribution(
    doc,
    rightX + 4,
    bottomY + 20,
    38,
    result.charts.periodDistribution,
    {
      maxItems: 3,
      barHeight: 4,
      rowGap: 7.1,
    },
  );

  writeText(doc, "Potencia y producción", rightX + 48, bottomY + 16, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  drawInfoRows(
    doc,
    rightX + 48,
    bottomY + 22,
    [
      ["Potencia", `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`],
      ["Cons. anual", `${formatNumber(proposal.annualConsumptionKwh, 0)} kWh`],
      [
        "Prod. anual",
        `${formatNumber(result.estimatedAnnualProductionKwh, 0)} kWh`,
      ],
      ["Autocons.", `${formatNumber(result.selfConsumptionRatio * 100, 0)} %`],
    ],
    17,
    22,
    {
      labelSize: 5.8,
      valueSize: 5.8,
      minValueSize: 5.2,
      lineHeight: 2.9,
      minRowHeight: 6.5,
    },
  );

  const concY = bottomY + gridCardH + 5;
  const concH = 42;

  drawShadow(doc, margin, concY, innerW, concH, 7);
  drawCard(doc, margin, concY, innerW, concH, COLORS.white, COLORS.border, 7);
  drawSectionTitle(doc, margin + 4, concY + 8, "CONCLUSIÓN EJECUTIVA");

  drawCard(doc, margin + 4, concY + 14, 85, 22, COLORS.soft, COLORS.border, 5);
  writeText(doc, "Resumen", margin + 8, concY + 19.5, {
    size: 7,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(doc, getConclusionText(proposal), margin + 8, concY + 25.2, {
    size: 5.8,
    color: COLORS.text,
    maxWidth: 75,
  });

  drawCard(
    doc,
    margin + 94,
    concY + 14,
    45,
    22,
    COLORS.mintSoft,
    COLORS.border,
    5,
  );
  writeText(
    doc,
    proposal.mode === "service" ? "Cuota mensual" : "Ahorro anual",
    margin + 116.5,
    concY + 20,
    {
      size: 5.8,
      color: COLORS.muted,
      fontStyle: "bold",
      align: "center",
    },
  );
  writeText(
    doc,
    proposal.mode === "service"
      ? proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar"
      : formatCurrency(proposal.annualSavings),
    margin + 116.5,
    concY + 28.2,
    {
      size: 8.7,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
      maxWidth: 39,
    },
  );
  writeText(doc, "estimado", margin + 116.5, concY + 32.8, {
    size: 5.5,
    color: COLORS.muted,
    align: "center",
  });

  drawCard(
    doc,
    margin + 143,
    concY + 14,
    47,
    22,
    COLORS.white,
    COLORS.border,
    5,
  );
  writeText(doc, "Modalidad", margin + 166.5, concY + 20, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(
    doc,
    proposal.mode === "service" ? "Servicio" : "Inversión",
    margin + 166.5,
    concY + 28.2,
    {
      size: 8.7,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
    },
  );
  writeText(doc, proposal.badge || viabilityLabel, margin + 166.5, concY + 32.8, {
    size: 5.8,
    color: COLORS.success,
    fontStyle: "bold",
    align: "center",
  });
}

function getRecommendedProposal(proposals: ProposalPdfSummary[]): ProposalPdfSummary | null {
  const investment = proposals.find((p) => p.mode === "investment");
  const service = proposals.find((p) => p.mode === "service");

  if (investment && service) {
    if (investment.totalSavings25Years >= service.totalSavings25Years) {
      return investment;
    }
    return service;
  }

  return proposals[0] || null;
}

function getRecommendationReason(
  recommended: ProposalPdfSummary | null,
  allProposals: ProposalPdfSummary[],
): { title: string; description: string } {
  if (!recommended) {
    return {
      title: "Recomendación pendiente",
      description:
        "No se ha podido determinar una recomendación final con la información disponible.",
    };
  }

  const hasInvestment = allProposals.some((p) => p.mode === "investment");
  const hasService = allProposals.some((p) => p.mode === "service");

  if (recommended.mode === "investment" && hasInvestment && hasService) {
    return {
      title: "Recomendamos la modalidad de inversión",
      description:
        "Es la alternativa con mayor ahorro acumulado a largo plazo y mejor rentabilidad global sobre el consumo detectado. Resulta especialmente adecuada cuando se prioriza maximizar el retorno económico del proyecto.",
    };
  }

  if (recommended.mode === "service" && hasInvestment && hasService) {
    return {
      title: "Recomendamos la modalidad de servicio",
      description:
        "Es la alternativa más adecuada cuando se prioriza una entrada inicial más cómoda, una cuota mensual clara y una contratación más flexible, manteniendo un ahorro energético relevante.",
    };
  }

  return {
    title:
      recommended.mode === "investment"
        ? "Recomendación: modalidad de inversión"
        : "Recomendación: modalidad de servicio",
    description: getConclusionText(recommended),
  };
}

function drawRecommendationSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  proposal: ProposalPdfSummary,
) {
  const accent = getModeAccent(proposal.mode);
  drawShadow(doc, x, y, w, h, 6);
  drawCard(doc, x, y, w, h, COLORS.white, COLORS.border, 6);

  setFill(doc, accent);
  doc.roundedRect(x, y, w, 12, 6, 6, "F");
  doc.rect(x, y + 6, w, 6, "F");

  writeText(
    doc,
    proposal.mode === "service" ? "MODALIDAD SERVICIO" : "MODALIDAD INVERSIÓN",
    x + 4,
    y + 7.5,
    {
      size: 7,
      color: COLORS.navy,
      fontStyle: "bold",
    },
  );

  const leftX = x + 4;
  const topY = y + 18;
  const gap = 3;
  const miniW = (w - 8 - gap) / 2;

  drawEconomicMiniCard(
    doc,
    leftX,
    topY,
    miniW,
    18,
    proposal.mode === "service" ? "Cuota mensual" : "Coste inicial",
    proposal.mode === "service"
      ? proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar"
      : formatCurrency(proposal.upfrontCost),
    COLORS.mintSoft,
  );

  drawEconomicMiniCard(
    doc,
    leftX + miniW + gap,
    topY,
    miniW,
    18,
    "Ahorro anual",
    formatCurrency(proposal.annualSavings),
  );

  drawEconomicMiniCard(
    doc,
    leftX,
    topY + 21,
    miniW,
    18,
    "Ahorro total",
    formatCurrency(proposal.totalSavings25Years),
  );

  drawEconomicMiniCard(
    doc,
    leftX + miniW + gap,
    topY + 21,
    miniW,
    18,
    proposal.mode === "service" ? "Potencia" : "Retorno",
    proposal.mode === "service"
      ? `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`
      : proposal.paybackYears > 0
        ? `${formatNumber(proposal.paybackYears, 1)} años`
        : "N/D",
  );

  writeText(doc, "Observación", x + 4, y + h - 12, {
    size: 6,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  writeText(
    doc,
    proposal.mode === "service"
      ? "Pensada para facilitar la entrada y mantener una cuota estable."
      : "Pensada para maximizar el ahorro acumulado y la rentabilidad a largo plazo.",
    x + 4,
    y + h - 7.5,
    {
      size: 5.8,
      color: COLORS.text,
      maxWidth: w - 8,
    },
  );
}

function renderRecommendationPage(
  doc: jsPDF,
  proposals: ProposalPdfSummary[],
  pageIndex: number,
  totalPages: number,
) {
  const PW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const innerW = PW - margin * 2;

  renderPageChrome(doc, "RECOMENDACIÓN FINAL", pageIndex, totalPages);

  const recommended = getRecommendedProposal(proposals);
  const reason = getRecommendationReason(recommended, proposals);

  const heroY = 28;
  drawShadow(doc, margin, heroY, innerW, 48, 8);
  drawCard(doc, margin, heroY, innerW, 48, COLORS.white, COLORS.border, 8);

  setFill(doc, COLORS.navy);
  doc.roundedRect(margin, heroY, innerW, 17, 8, 8, "F");
  doc.rect(margin, heroY + 9, innerW, 8, "F");

  writeText(doc, "RECOMENDACIÓN SAPIENS", margin + 6, heroY + 9, {
    size: 8,
    color: COLORS.sky,
    fontStyle: "bold",
  });

  writeText(doc, reason.title, margin + 6, heroY + 23, {
    size: 16,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: 120,
  });

  writeText(doc, reason.description, margin + 6, heroY + 33, {
    size: 7,
    color: COLORS.text,
    maxWidth: 120,
  });

  drawCard(doc, 150, heroY + 8, 40, 26, COLORS.mintSoft, COLORS.border, 6);
  writeText(doc, "MODALIDAD", 170, heroY + 15, {
    size: 6,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(
    doc,
    recommended
      ? recommended.mode === "service"
        ? "Servicio"
        : "Inversión"
      : "N/D",
    170,
    heroY + 24.5,
    {
      size: 11,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
    },
  );
  writeText(doc, recommended?.badge || "Recomendación", 170, heroY + 29.8, {
    size: 6,
    color: COLORS.success,
    fontStyle: "bold",
    align: "center",
  });

  const cardsY = 84;
  const gap = 4;
  const cardW = (innerW - gap) / 2;
  const cardH = 78;

  const investment = proposals.find((p) => p.mode === "investment");
  const service = proposals.find((p) => p.mode === "service");

  if (investment) {
    drawRecommendationSummaryCard(doc, margin, cardsY, cardW, cardH, investment);
  }

  if (service) {
    drawRecommendationSummaryCard(
      doc,
      margin + cardW + gap,
      cardsY,
      cardW,
      cardH,
      service,
    );
  }

  if (!investment && recommended) {
    drawRecommendationSummaryCard(doc, margin, cardsY, innerW, cardH, recommended);
  }

  const conclusionY = cardsY + cardH + 6;
  drawShadow(doc, margin, conclusionY, innerW, 72, 7);
  drawCard(doc, margin, conclusionY, innerW, 72, COLORS.white, COLORS.border, 7);
  drawSectionTitle(doc, margin + 4, conclusionY + 8, "CONCLUSIÓN Y SIGUIENTE PASO");

  drawCard(
    doc,
    margin + 4,
    conclusionY + 14,
    innerW - 8,
    24,
    COLORS.soft,
    COLORS.border,
    5,
  );
  writeText(doc, "Conclusión ejecutiva", margin + 8, conclusionY + 20, {
    size: 7,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(
    doc,
    recommended
      ? recommended.mode === "investment"
        ? "Por perfil económico y ahorro acumulado, recomendamos avanzar con la modalidad de inversión. Es la opción que mejor capitaliza el consumo detectado y ofrece una rentabilidad más sólida en el horizonte analizado."
        : "Por flexibilidad de entrada y equilibrio entre ahorro y facilidad de contratación, recomendamos valorar la modalidad de servicio como la vía más cómoda para iniciar el proyecto."
      : "No se ha podido establecer una recomendación final automática.",
    margin + 8,
    conclusionY + 27,
    {
      size: 6.2,
      color: COLORS.text,
      maxWidth: innerW - 16,
    },
  );

  drawCard(
    doc,
    margin + 4,
    conclusionY + 42,
    innerW - 8,
    22,
    COLORS.mintSoft,
    COLORS.border,
    5,
  );
  writeText(doc, "Siguiente paso recomendado", margin + 8, conclusionY + 48, {
    size: 7,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(
    doc,
    "Validar la propuesta seleccionada, revisar los datos del suministro y continuar con la reserva o contratación según la modalidad elegida.",
    margin + 8,
    conclusionY + 55,
    {
      size: 6.2,
      color: COLORS.text,
      maxWidth: innerW - 16,
    },
  );
}

export const generateStudyPDF = (
  data: BillData,
  result: CalculationResult,
  proposalInput: ProposalPdfSummary | ProposalPdfSummary[],
) => {
  const proposalList = normalizeProposalInput(proposalInput);

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  if (proposalList.length === 0) {
    return doc;
  }

  const totalPages = proposalList.length + 1;

  proposalList.forEach((proposal, index) => {
    if (index > 0) {
      doc.addPage();
    }

    renderStudyPdfPage(doc, data, result, proposal, index, totalPages);
  });

  doc.addPage();
  renderRecommendationPage(doc, proposalList, proposalList.length, totalPages);

  return doc;
};

export const getStudyPdfBase64 = (
  data: BillData,
  result: CalculationResult,
  proposalInput: ProposalPdfSummary | ProposalPdfSummary[],
): string => {
  const doc = generateStudyPDF(data, result, proposalInput);
  return doc.output("datauristring");
};