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
  bg: [245, 248, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  navy: [9, 33, 94] as [number, number, number],
  navySoft: [18, 48, 126] as [number, number, number],
  cyan: [73, 211, 204] as [number, number, number],
  sky: [177, 226, 250] as [number, number, number],
  mintSoft: [234, 248, 245] as [number, number, number],
  soft: [239, 245, 251] as [number, number, number],
  border: [220, 229, 239] as [number, number, number],
  text: [49, 65, 91] as [number, number, number],
  muted: [113, 128, 150] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  shadow: [231, 238, 246] as [number, number, number],
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

function setFill(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function drawShadow(doc: jsPDF, x: number, y: number, w: number, h: number) {
  setFill(doc, COLORS.shadow);
  doc.roundedRect(x + 1.2, y + 1.8, w, h, 5, 5, "F");
}

function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number] = COLORS.white,
  stroke: [number, number, number] = COLORS.border,
  radius = 5,
) {
  setFill(doc, fill);
  setDraw(doc, stroke);
  doc.setLineWidth(0.45);
  doc.roundedRect(x, y, w, h, radius, radius, "FD");
}

function writeText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: {
    size?: number;
    color?: [number, number, number];
    fontStyle?: "normal" | "bold";
    maxWidth?: number;
    align?: "left" | "center" | "right";
  },
) {
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
) {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(size);
  return doc.splitTextToSize(text || "-", maxWidth) as string[];
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, title: string) {
  writeText(doc, title, x, y, {
    size: 8.4,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  setFill(doc, COLORS.cyan);
  doc.roundedRect(x, y + 1.8, 22, 1.35, 1, 1, "F");
}

function drawChip(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  width = 28,
  fill: [number, number, number] = COLORS.white,
) {
  drawCard(doc, x, y, width, 7.5, fill, COLORS.border, 3.5);
  writeText(doc, text, x + width / 2, y + 5, {
    size: 6.5,
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
  accent: [number, number, number],
) {
  drawShadow(doc, x, y, w, h);
  drawCard(doc, x, y, w, h, COLORS.white, COLORS.border, 5);

  setFill(doc, accent);
  doc.roundedRect(x + 3.5, y + 4.2, 2.4, h - 8.4, 1.2, 1.2, "F");

  writeText(doc, label, x + 8.5, y + 6.8, {
    size: 6.1,
    color: COLORS.muted,
    fontStyle: "bold",
    maxWidth: w - 12,
  });

  writeText(doc, value, x + 8.5, y + 14.2, {
    size: 9.3,
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
) {
  let currentY = y;

  rows.forEach(([label, value]) => {
    const labelLines = getLines(doc, label, labelWidth, 6.7, "bold");
    const valueSize = (value || "").length > 65 ? 6.1 : 6.7;
    const valueLines = getLines(doc, value || "-", valueWidth, valueSize, "normal");
    const lineCount = Math.max(labelLines.length, valueLines.length);
    const rowHeight = Math.max(9.5, lineCount * 4 + 2.6);

    writeText(doc, label, x, currentY, {
      size: 6.7,
      color: COLORS.muted,
      fontStyle: "bold",
      maxWidth: labelWidth,
    });

    writeText(doc, value || "-", x + labelWidth + 2, currentY, {
      size: valueSize,
      color: COLORS.navy,
      maxWidth: valueWidth,
    });

    currentY += rowHeight;
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
) {
  drawCard(doc, x, y, w, 24, COLORS.soft, COLORS.border, 5);

  drawCard(doc, x + 3, y + 4, 9, 9, COLORS.navy, COLORS.navy, 3.5);
  writeText(doc, String(index), x + 7.5, y + 9.7, {
    size: 7.2,
    color: COLORS.white,
    fontStyle: "bold",
    align: "center",
  });

  writeText(doc, title, x + 15, y + 7.3, {
    size: 7.1,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 19,
  });

  writeText(doc, description, x + 15, y + 13, {
    size: 6.05,
    color: COLORS.text,
    maxWidth: w - 19,
  });
}

function drawPeriodDistribution(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  items: PeriodChartItem[],
) {
  let currentY = y;
  const validItems = items
    .filter((item) => Number(item.percentage) > 0)
    .slice(0, 6);

  validItems.forEach((item) => {
    writeText(doc, item.label, x, currentY + 3.6, {
      size: 6.4,
      color: COLORS.navy,
      fontStyle: "bold",
    });

    drawCard(
      doc,
      x + 14,
      currentY,
      w - 30,
      4.8,
      [230, 237, 245],
      [230, 237, 245],
      2,
    );

    const barWidth = Math.max(4, ((w - 30) * item.percentage) / 100);

    setFill(doc, COLORS.cyan);
    doc.roundedRect(x + 14, currentY, barWidth, 4.8, 2, 2, "F");

    writeText(doc, `${formatNumber(item.percentage, 1)}%`, x + w, currentY + 3.6, {
      size: 5.8,
      color: COLORS.muted,
      align: "right",
    });

    currentY += 8.8;
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
  fill: [number, number, number] = COLORS.white,
) {
  drawCard(doc, x, y, w, h, fill, COLORS.border, 5);

  writeText(doc, label, x + w / 2, y + 6.4, {
    size: 6.2,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 6,
  });

  writeText(doc, value, x + w / 2, y + 14.2, {
    size: 8.8,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
    maxWidth: w - 6,
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
        title: "Empezar a ahorrar con menor entrada",
        description:
          "La modalidad de servicio reduce la barrera inicial y facilita una adopción más cómoda del autoconsumo.",
      },
      {
        title: "Comparar cuota y ahorro estimado",
        description:
          "Conviene validar la cuota mensual frente al ahorro anual esperado para medir el equilibrio económico del servicio.",
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
      title: "Revisar amortización y horizonte",
      description:
        "La inversión directa gana atractivo cuando el cliente prioriza rentabilidad, control del activo y ahorro sostenido.",
    },
  ];
}

function getConclusionText(proposal: ProposalPdfSummary) {
  if (proposal.mode === "service") {
    return "La modalidad de servicio encaja bien cuando se busca una entrada más cómoda, una cuota mensual clara y una decisión de contratación más flexible.";
  }

  return "La modalidad de inversión encaja mejor cuando se prioriza el ahorro acumulado, la amortización de la instalación y la rentabilidad a medio y largo plazo.";
}

function drawEconomicSummary(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  proposal: ProposalPdfSummary,
) {
  const gap = 4;
  const cardW = (w - gap * 2) / 3;

  if (proposal.mode === "service") {
    drawEconomicMiniCard(
      doc,
      x,
      y,
      cardW,
      24,
      "Cuota mensual",
      proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar",
      COLORS.mintSoft,
    );

    drawEconomicMiniCard(
      doc,
      x + cardW + gap,
      y,
      cardW,
      24,
      "Ahorro anual",
      formatCurrency(proposal.annualSavings),
    );

    drawEconomicMiniCard(
      doc,
      x + (cardW + gap) * 2,
      y,
      cardW,
      24,
      "Ahorro 25 años",
      formatCurrency(proposal.totalSavings25Years),
    );

    writeText(
      doc,
      "Modalidad pensada para una incorporación más suave al autoconsumo, manteniendo visibilidad económica desde el primer momento.",
      x,
      y + 31.5,
      {
        size: 6.25,
        color: COLORS.text,
        maxWidth: w,
      },
    );
  } else {
    drawEconomicMiniCard(
      doc,
      x,
      y,
      cardW,
      24,
      "Inversión inicial",
      formatCurrency(proposal.upfrontCost),
      COLORS.mintSoft,
    );

    drawEconomicMiniCard(
      doc,
      x + cardW + gap,
      y,
      cardW,
      24,
      "Ahorro anual",
      formatCurrency(proposal.annualSavings),
    );

    drawEconomicMiniCard(
      doc,
      x + (cardW + gap) * 2,
      y,
      cardW,
      24,
      "Payback",
      proposal.paybackYears > 0
        ? `${formatNumber(proposal.paybackYears, 1)} años`
        : "N/D",
    );

    writeText(
      doc,
      "Modalidad enfocada en consolidar un mayor ahorro acumulado y aprovechar mejor el retorno económico de la instalación.",
      x,
      y + 31.5,
      {
        size: 6.25,
        color: COLORS.text,
        maxWidth: w,
      },
    );
  }
}

export const generateStudyPDF = (
  data: BillData,
  result: CalculationResult,
  proposal: ProposalPdfSummary,
) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const safeName =
    `${data.name || ""} ${data.lastName || ""}`.trim() || "Cliente";
  const viabilityLabel =
    result.viabilityScore >= 75
      ? "Alta"
      : result.viabilityScore >= 50
        ? "Media"
        : "Baja";

  const modeAccent = getModeAccent(proposal.mode);
  const heroTitle =
    proposal.mode === "service"
      ? "Propuesta energética\nmodalidad servicio"
      : "Propuesta energética\nmodalidad inversión";

  const heroTitleLines = getLines(doc, heroTitle, 62, 14, "bold");
  const heroSubtitleY = 39 + heroTitleLines.length * 6.1;

  setFill(doc, COLORS.bg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Header
  setDraw(doc, COLORS.navy);
  doc.setLineWidth(0.8);
  doc.line(10, 9, 200, 9);

  writeText(doc, "SAPIENS ENERGÍA", 10, 14, {
    size: 7.2,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  writeText(doc, "PROPUESTA ENERGÉTICA", 10, 20, {
    size: 11.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawCard(doc, 165, 11, 35, 10, COLORS.white, COLORS.border, 4.5);
  writeText(doc, "FECHA", 182.5, 15, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, new Date().toLocaleDateString("es-ES"), 182.5, 19.2, {
    size: 7.3,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
  });

  // Hero
  drawShadow(doc, 10, 25, 190, 31);
  drawCard(doc, 10, 25, 190, 31, COLORS.white, COLORS.border, 7);

  setFill(doc, COLORS.navy);
  doc.roundedRect(10, 25, 73, 31, 7, 7, "F");
  doc.rect(76, 25, 7, 31, "F");

  writeText(doc, "INFORME EJECUTIVO", 15, 32, {
    size: 7,
    color: COLORS.sky,
    fontStyle: "bold",
  });

  writeText(doc, heroTitle, 15, 39, {
    size: 13.6,
    color: COLORS.white,
    fontStyle: "bold",
    maxWidth: 60,
  });

  writeText(doc, getHeroSubtitle(proposal.mode), 15, heroSubtitleY, {
    size: 6.05,
    color: [232, 240, 248],
    maxWidth: 60,
  });

  drawChip(doc, 88, 30, data.billType || "2TD", 27);
  drawChip(
    doc,
    118,
    30,
    proposal.mode === "service" ? "Servicio" : "Inversión",
    28,
  );
  drawChip(doc, 149, 30, proposal.badge || "Ahorro", 29, COLORS.mintSoft);

  drawCard(doc, 151, 36.5, 38, 14, COLORS.mintSoft, COLORS.border, 5);
  writeText(doc, "VIABILIDAD SOLAR", 170, 41.4, {
    size: 5.8,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, String(result.viabilityScore), 170, 47.5, {
    size: 14,
    color: COLORS.navy,
    fontStyle: "bold",
    align: "center",
  });
  writeText(doc, viabilityLabel, 170, 51.5, {
    size: 7,
    color: COLORS.success,
    fontStyle: "bold",
    align: "center",
  });

  // KPI row
  drawMetricCard(
    doc,
    10,
    61,
    45,
    16,
    "CONSUMO MENSUAL",
    `${formatNumber(result.averageMonthlyConsumptionKwh)} kWh`,
    modeAccent,
  );

  drawMetricCard(
    doc,
    59,
    61,
    45,
    16,
    proposal.mode === "service" ? "CUOTA MENSUAL" : "COSTE ANUAL",
    proposal.mode === "service"
      ? proposal.monthlyFee && proposal.monthlyFee > 0
        ? `${formatCurrency(proposal.monthlyFee)} / mes`
        : "Consultar"
      : formatCurrency(result.estimatedAnnualEnergyCost),
    modeAccent,
  );

  drawMetricCard(
    doc,
    108,
    61,
    45,
    16,
    "AHORRO ANUAL",
    formatCurrency(proposal.annualSavings),
    modeAccent,
  );

  drawMetricCard(
    doc,
    157,
    61,
    43,
    16,
    proposal.mode === "service" ? "Ahorro 25 años" : "PAYBACK",
    proposal.mode === "service"
      ? formatCurrency(proposal.totalSavings25Years)
      : proposal.paybackYears > 0
        ? `${formatNumber(proposal.paybackYears, 1)} años`
        : "N/D",
    COLORS.sky,
  );

  // Datos del suministro
  drawShadow(doc, 10, 83, 82, 68);
  drawCard(doc, 10, 83, 82, 68, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, 14, 90, "DATOS DEL SUMINISTRO");

  drawInfoRows(
    doc,
    14,
    99,
    [
      ["Titular", safeName],
      ["CUPS", data.cups || "-"],
      ["Tarifa", data.billType || "-"],
      ["Dirección", data.address || "-"],
      ["Email", data.email || "-"],
      ["IBAN", data.iban || "-"],
    ],
    20,
    44,
  );

  // Recomendaciones
  drawShadow(doc, 96, 83, 104, 68);
  drawCard(doc, 96, 83, 104, 68, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, 100, 90, "RECOMENDACIONES PRIORITARIAS");

  const recommendations = getRecommendationItems(proposal.mode);
  drawRecommendationItem(
    doc,
    100,
    99,
    94,
    recommendations[0].title,
    recommendations[0].description,
    1,
  );
  drawRecommendationItem(
    doc,
    100,
    127,
    94,
    recommendations[1].title,
    recommendations[1].description,
    2,
  );

  // Bloque económico
  drawShadow(doc, 10, 157, 94, 50);
  drawCard(doc, 10, 157, 94, 50, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, 14, 164, "RESUMEN ECONÓMICO");
  drawEconomicSummary(doc, 14, 173, 86, proposal);

  // Bloque técnico
  drawShadow(doc, 108, 157, 92, 50);
  drawCard(doc, 108, 157, 92, 50, COLORS.white, COLORS.border, 6);
  drawSectionTitle(doc, 112, 164, "PERFIL TÉCNICO");

  writeText(doc, "Distribución del consumo", 112, 171, {
    size: 6.4,
    color: COLORS.muted,
    fontStyle: "bold",
  });
  drawPeriodDistribution(doc, 112, 177, 34, result.charts.periodDistribution);

  writeText(doc, "Potencia y producción", 154, 171, {
    size: 6.4,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  drawInfoRows(
    doc,
    154,
    178,
    [
      ["Potencia", `${formatNumber(proposal.recommendedPowerKwp, 1)} kWp`],
      ["Cons. anual", `${formatNumber(proposal.annualConsumptionKwh)} kWh`],
      ["Prod. anual", `${formatNumber(result.estimatedAnnualProductionKwh)} kWh`],
      ["Autocons.", `${formatNumber(result.selfConsumptionRatio * 100, 0)} %`],
    ],
    16,
    18,
  );

  // Conclusión
  drawShadow(doc, 10, 213, 190, 45);
  drawCard(doc, 10, 213, 190, 45, COLORS.white, COLORS.border, 7);
  drawSectionTitle(doc, 14, 220, "CONCLUSIÓN EJECUTIVA");

  drawCard(doc, 14, 226, 84, 24, COLORS.soft, COLORS.border, 5);
  writeText(doc, "Resumen", 18, 232, {
    size: 7.1,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(doc, getConclusionText(proposal), 18, 239, {
    size: 6.15,
    color: COLORS.text,
    maxWidth: 74,
  });

  drawCard(doc, 102, 226, 44, 24, COLORS.mintSoft, COLORS.border, 5);
  writeText(
    doc,
    proposal.mode === "service" ? "Cuota estimada" : "Ahorro anual",
    124,
    232,
    {
      size: 6.2,
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
        : formatCurrency(proposal.annualSavings)
      : formatCurrency(proposal.annualSavings),
    124,
    240,
    {
      size: 10.2,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
      maxWidth: 38,
    },
  );
  writeText(doc, "estimado", 124, 245, {
    size: 6,
    color: COLORS.muted,
    align: "center",
  });

  drawCard(doc, 150, 226, 46, 24, COLORS.white, COLORS.border, 5);
  writeText(doc, "Modalidad", 173, 232, {
    size: 6.2,
    color: COLORS.muted,
    fontStyle: "bold",
    align: "center",
  });
  writeText(
    doc,
    proposal.mode === "service" ? "Servicio" : "Inversión",
    173,
    240,
    {
      size: 10.2,
      color: COLORS.navy,
      fontStyle: "bold",
      align: "center",
    },
  );
  writeText(doc, proposal.badge || viabilityLabel, 173, 245, {
    size: 6.2,
    color: COLORS.success,
    fontStyle: "bold",
    align: "center",
  });

  // Footer
  setDraw(doc, COLORS.navy);
  doc.setLineWidth(0.8);
  doc.line(10, 280, 200, 280);

  writeText(
    doc,
    "Propuesta generada automáticamente por Sapiens Energía a partir del análisis documental de la factura del cliente.",
    105,
    286,
    {
      size: 5.8,
      color: COLORS.muted,
      align: "center",
      maxWidth: 150,
    },
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