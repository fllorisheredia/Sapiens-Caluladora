import { jsPDF } from "jspdf";
import { type CalculationResult, type PeriodChartItem, type ChartBarItem } from "../calculation/energyService";
import { type BillData } from "../../lib/validators";

const COLORS = {
  bg: [247, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  navy: [6, 26, 120] as [number, number, number],
  cyan: [93, 208, 196] as [number, number, number],
  sky: [167, 216, 247] as [number, number, number],
  border: [218, 231, 242] as [number, number, number],
  text: [51, 65, 85] as [number, number, number],
  muted: [113, 128, 150] as [number, number, number],
  soft: [234, 247, 251] as [number, number, number],
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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

function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number] = COLORS.white,
  stroke: [number, number, number] = COLORS.border,
  radius = 4
) {
  setFill(doc, fill);
  setDraw(doc, stroke);
  doc.setLineWidth(0.4);
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
  }
) {
  const {
    size = 10,
    color = COLORS.text,
    fontStyle = "normal",
    maxWidth,
  } = options || {};

  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(size);
  setText(doc, color);

  if (maxWidth) {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length;
  }

  doc.text(text, x, y);
  return 1;
}

function drawChip(doc: jsPDF, x: number, y: number, text: string) {
  drawCard(doc, x, y, 24, 6, COLORS.white, COLORS.border, 3);
  writeText(doc, text, x + 12, y + 4.2, {
    size: 6.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });
}

function drawMetricCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string
) {
  drawCard(doc, x, y, w, h, COLORS.white, COLORS.border, 4);
  writeText(doc, label, x + 4, y + 5, {
    size: 6.5,
    color: COLORS.muted,
    fontStyle: "bold",
  });
  writeText(doc, value, x + 4, y + 11.5, {
    size: 10,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: w - 8,
  });
}

function drawKeyValueList(
  doc: jsPDF,
  x: number,
  y: number,
  rows: Array<[string, string]>,
  rowGap = 6
) {
  let currentY = y;

  rows.forEach(([label, value]) => {
    writeText(doc, label, x, currentY, {
      size: 7,
      color: COLORS.muted,
      fontStyle: "normal",
    });

    writeText(doc, value, x + 32, currentY, {
      size: 7.2,
      color: COLORS.navy,
      fontStyle: "bold",
      maxWidth: 42,
    });

    currentY += rowGap;
  });
}

function drawRecommendations(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  items: string[]
) {
  let currentY = y;

  items.slice(0, 2).forEach((item, index) => {
    drawCard(doc, x, currentY - 4, 8, 8, COLORS.navy, COLORS.navy, 3);
    writeText(doc, String(index + 1), x + 4, currentY + 1.4, {
      size: 7,
      color: COLORS.white,
      fontStyle: "bold",
    });

    const title =
      index === 0
        ? "Valorar autoconsumo fotovoltaico"
        : "Comparar condiciones del mercado";

    writeText(doc, title, x + 11, currentY, {
      size: 7.6,
      color: COLORS.navy,
      fontStyle: "bold",
      maxWidth: width - 15,
    });

    const split = doc.splitTextToSize(item, width - 15);
    writeText(doc, split.join("\n"), x + 11, currentY + 4.5, {
      size: 6.8,
      color: COLORS.text,
      maxWidth: width - 15,
    });

    currentY += 20;
  });
}

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  items: ChartBarItem[]
) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const chartBottom = y + h - 8;
  const barWidth = 8;
  const gap = 10;
  const startX = x + 10;

  doc.setLineWidth(0.2);
  setDraw(doc, COLORS.border);
  doc.line(x + 6, chartBottom, x + w - 6, chartBottom);

  items.forEach((item, index) => {
    const barHeight = Math.max(4, (item.value / max) * (h - 22));
    const barX = startX + index * (barWidth + gap);
    const barY = chartBottom - barHeight;

    setFill(doc, index === 2 ? COLORS.navy : COLORS.cyan);
    doc.roundedRect(barX, barY, barWidth, barHeight, 2, 2, "F");

    writeText(doc, item.label, barX + 1.8, chartBottom + 5, {
      size: 6,
      color: COLORS.muted,
      fontStyle: "normal",
    });

    writeText(doc, formatNumber(item.value, 0), barX - 1, barY - 2, {
      size: 5.5,
      color: COLORS.navy,
      fontStyle: "bold",
    });
  });
}

function drawPeriodDistribution(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  items: PeriodChartItem[]
) {
  let currentY = y;

  items.forEach((item) => {
    writeText(doc, item.label, x, currentY + 3.5, {
      size: 6.5,
      color: COLORS.navy,
      fontStyle: "bold",
    });

    drawCard(doc, x + 12, currentY, w - 28, 4, [230, 238, 245], [230, 238, 245], 2);
    setFill(doc, COLORS.cyan);
    doc.roundedRect(
      x + 12,
      currentY,
      ((w - 28) * item.percentage) / 100,
      4,
      2,
      2,
      "F"
    );

    writeText(doc, `${formatNumber(item.percentage, 1)}%`, x + w - 13, currentY + 3.4, {
      size: 6,
      color: COLORS.muted,
      fontStyle: "normal",
    });

    currentY += 8;
  });
}

export const generateStudyPDF = (data: BillData, result: CalculationResult) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  console.log("Genrado PDF con ests datos", {data,result})
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  setFill(doc, COLORS.bg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Header
  doc.setLineWidth(0.8);
  setDraw(doc, COLORS.navy);
  doc.line(8, 8, 202, 8);

  writeText(doc, "L'ENERGIA EN MANS DE LA GENT", 8, 12, {
    size: 6.5,
    color: COLORS.muted,
    fontStyle: "bold",
  });

  writeText(doc, "PROPOSTA ENERGÈTICA", 8, 16.5, {
    size: 8.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawCard(doc, 182, 8.5, 20, 7, COLORS.white, COLORS.border, 3);
  writeText(doc, new Date().toLocaleDateString("es-ES"), 186, 13, {
    size: 6.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  // Hero
  drawCard(doc, 8, 20, 128, 28, COLORS.soft, COLORS.border, 6);
  writeText(doc, "INFORME EJECUTIVO", 12, 26, {
    size: 6.8,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  writeText(doc, "Estudio energético personalizado del suministro", 12, 33, {
    size: 14,
    color: COLORS.navy,
    fontStyle: "bold",
    maxWidth: 92,
  });

  writeText(
    doc,
    "Documento generado a partir del análisis de la factura aportada, con visión ejecutiva del consumo, coste y potencial de mejora energética del punto de suministro.",
    12,
    41.2,
    {
      size: 6.6,
      color: COLORS.text,
      fontStyle: "normal",
      maxWidth: 92,
    }
  );

  drawChip(doc, 12, 44, data.billType || "2TD");
  drawChip(doc, 38, 44, "Libre");
  drawChip(doc, 64, 44, "Oportunidad");

  drawCard(doc, 141, 20, 61, 28, COLORS.white, COLORS.border, 6);
  writeText(doc, "VIABILIDAD SOLAR", 156, 31, {
    size: 7,
    color: COLORS.muted,
    fontStyle: "bold",
  });
  writeText(doc, String(result.viabilityScore), 165, 39, {
    size: 18,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(
    doc,
    result.viabilityScore >= 75 ? "Alta" : result.viabilityScore >= 50 ? "Media" : "Baja",
    166,
    45,
    {
      size: 9,
      color: COLORS.navy,
      fontStyle: "bold",
    }
  );

  // Datos suministro
  drawCard(doc, 8, 52, 82, 48, COLORS.white, COLORS.border, 5);
  writeText(doc, "DATOS DEL SUMINISTRO", 11, 58, {
    size: 8,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawKeyValueList(doc, 11, 66, [
    ["Titular", `${data.name} ${data.lastName}`.trim() || "-"],
    ["CUPS", data.cups || "-"],
    ["Tarifa ATR", data.billType || "-"],
    ["Dirección", data.address || "-"],
    ["Email", data.email || "-"],
  ]);

  // Métricas
  drawMetricCard(doc, 94, 52, 34, 14, "CONSUMO TOTAL", `${formatNumber(result.invoiceConsumptionKwh)} kWh`);
  drawMetricCard(doc, 131, 52, 34, 14, "AHORRO INV.", formatCurrency(result.annualSavingsInvestment));
  drawMetricCard(doc, 168, 52, 34, 14, "COSTE KWH", `${formatNumber(result.weightedEnergyPriceKwh, 3)} €/kWh`);

  drawMetricCard(doc, 94, 69, 34, 14, "CONSUMO MENSUAL", `${formatNumber(result.averageMonthlyConsumptionKwh)} kWh`);
  drawMetricCard(doc, 131, 69, 34, 14, "COSTE ANUAL", formatCurrency(result.estimatedAnnualEnergyCost));
  drawMetricCard(doc, 168, 69, 34, 14, "PAYBACK", result.paybackYears ? `${formatNumber(result.paybackYears, 1)} años` : "N/D");

  // Recomendaciones
  drawCard(doc, 8, 104, 82, 92, COLORS.white, COLORS.border, 5);
  writeText(doc, "RECOMENDACIONES PRIORITARIAS", 11, 111, {
    size: 8,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  const recTexts = [
    "El nivel de consumo detectado hace razonable estudiar una instalación fotovoltaica para reducir coste energético.",
    "La distribución tarifaria y el coste energético medio justifican revisar la propuesta en modalidad de inversión o servicio.",
  ];

  drawRecommendations(doc, 12, 120, 72, recTexts);

  // Distribución consumo
  drawCard(doc, 94, 86, 52, 42, COLORS.white, COLORS.border, 5);
  writeText(doc, "DISTRIBUCIÓN DEL CONSUMO", 98, 93, {
    size: 7.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawPeriodDistribution(doc, 98, 100, 44, result.charts.periodDistribution);

  // Proyección económica
  drawCard(doc, 150, 86, 52, 42, COLORS.white, COLORS.border, 5);
  writeText(doc, "PROYECCIÓN ECONÓMICA", 154, 93, {
    size: 7.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawBarChart(doc, 154, 98, 42, 24, result.charts.savingsProjectionInvestment);

  // Potencia y consumo
  drawCard(doc, 94, 132, 52, 64, COLORS.white, COLORS.border, 5);
  writeText(doc, "POTENCIA Y CONSUMO", 98, 139, {
    size: 7.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawKeyValueList(doc, 98, 147, [
    ["Consumo mensual", `${formatNumber(result.averageMonthlyConsumptionKwh)} kWh`],
    ["Consumo anual", `${formatNumber(result.annualConsumptionKwh)} kWh`],
    ["Horas efectivas", `${formatNumber(result.estimatedAnnualProductionKwh / Math.max(result.recommendedPowerKwp, 1))} h`],
    ["Potencia rec.", `${formatNumber(result.recommendedPowerKwp, 1)} kWp`],
    ["Prod. anual", `${formatNumber(result.estimatedAnnualProductionKwh)} kWh`],
    ["Autoconsumo", `${formatNumber(result.selfConsumptionRatio * 100)} %`],
  ]);

  // Conclusión
  drawCard(doc, 150, 132, 52, 64, COLORS.white, COLORS.border, 5);
  writeText(doc, "CONCLUSIÓN Y ALERTAS", 154, 139, {
    size: 7.5,
    color: COLORS.navy,
    fontStyle: "bold",
  });

  drawCard(doc, 154, 145, 44, 16, COLORS.soft, COLORS.border, 4);
  writeText(doc, "CONCLUSIÓN EJECUTIVA", 157, 150, {
    size: 6.7,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(
    doc,
    "El consumo estimado anual es suficiente para que una instalación fotovoltaica resulte interesante.",
    157,
    154.5,
    {
      size: 6.3,
      color: COLORS.text,
      maxWidth: 37,
    }
  );

  drawCard(doc, 154, 165, 44, 16, COLORS.white, COLORS.border, 4);
  writeText(doc, "Situación estable", 157, 170, {
    size: 6.7,
    color: COLORS.navy,
    fontStyle: "bold",
  });
  writeText(
    doc,
    "No se detectan incidencias críticas con la información disponible.",
    157,
    174.5,
    {
      size: 6.3,
      color: COLORS.text,
      maxWidth: 37,
    }
  );

  // Footer
  doc.setLineWidth(0.8);
  setDraw(doc, COLORS.navy);
  doc.line(8, 283, 202, 283);

  writeText(
    doc,
    "Propuesta generada automáticamente por Sapiens Energía a partir del análisis documental de la factura del cliente.",
    58,
    287,
    {
      size: 6,
      color: COLORS.muted,
      fontStyle: "normal",
    }
  );

  return doc;
};

export const getStudyPdfBase64 = (
  data: BillData,
  result: CalculationResult
): string => {
  const doc = generateStudyPDF(data, result);
  return doc.output("datauristring");
};