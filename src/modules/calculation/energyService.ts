export type BillType = "2TD" | "3TD";
export type PeriodKey = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export interface CalculationInput {
  monthlyConsumptionKwh: number;
  billType: BillType;
  effectiveHours: number;
  investmentCostKwh: number;
  serviceCostKwh: number;
  selfConsumptionRatio: number;

  // Opcionales para hacer el cálculo más realista
  invoiceConsumptionKwh?: number;
  monthlyChartConsumptions?: number[];
  periodPrices?: Partial<Record<PeriodKey, number>>;

  // Si en el futuro quieres separar completamente la tarifa de ahorro real del coste de inversión/servicio
  savingsRateInvestmentKwh?: number;
  savingsRateServiceKwh?: number;
}

export interface ChartBarItem {
  label: string;
  value: number;
}

export interface PeriodChartItem {
  label: PeriodKey;
  value: number;
  percentage: number;
}

export interface CalculationResult {
  annualConsumptionKwh: number;
  averageMonthlyConsumptionKwh: number;
  invoiceConsumptionKwh: number;

  recommendedPowerKwp: number;

  investmentCost: number;
  serviceCost: number;

  annualSavingsInvestment: number;
  annualSavingsService: number;

  monthlySavingsInvestment: number;
  monthlySavingsService: number;

  dailySavingsInvestment: number;
  dailySavingsService: number;

  annualSavings25YearsInvestment: number;
  annualSavings25YearsService: number;

  estimatedAnnualProductionKwh: number;
  estimatedMonthlyEnergyCost: number;
  estimatedAnnualEnergyCost: number;

  weightedEnergyPriceKwh: number;
  weightedInvestmentSavingsRateKwh: number;
  weightedServiceSavingsRateKwh: number;

  selfConsumptionRatio: number;
  viabilityScore: number;
  paybackYears: number | null;

  periodDistribution: Record<PeriodKey, number>;
  periodPercentages: Record<PeriodKey, number>;

  charts: {
    savingsProjectionInvestment: ChartBarItem[];
    savingsProjectionService: ChartBarItem[];
    periodDistribution: PeriodChartItem[];
  };

  formulaVersion: string;
}

const PERIOD_PERCENTAGES: Record<BillType, Record<PeriodKey, number>> = {
  "2TD": {
    P1: 0.385,
    P2: 0.342,
    P3: 0.273,
    P4: 0,
    P5: 0,
    P6: 0,
  },
  "3TD": {
    P1: 0.124,
    P2: 0.181,
    P3: 0.156,
    P4: 0.148,
    P5: 0.109,
    P6: 0.282,
  },
};

const ALL_PERIODS: PeriodKey[] = ["P1", "P2", "P3", "P4", "P5", "P6"];

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function normalizePositive(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function roundUpToHalf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 2) / 2;
}

function averageValid(values?: number[]): number | undefined {
  if (!Array.isArray(values)) return undefined;

  const clean = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0
  );

  if (!clean.length) return undefined;

  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function resolveWeightedEnergyPrice(
  billType: BillType,
  periodPrices?: Partial<Record<PeriodKey, number>>
): number | undefined {
  if (!periodPrices) return undefined;

  const weights = PERIOD_PERCENTAGES[billType];
  let weightedSum = 0;
  let usedWeight = 0;

  for (const period of ALL_PERIODS) {
    const price = periodPrices[period];
    const weight = weights[period];

    if (
      typeof price === "number" &&
      Number.isFinite(price) &&
      price > 0 &&
      weight > 0
    ) {
      weightedSum += price * weight;
      usedWeight += weight;
    }
  }

  if (usedWeight > 0) {
    return weightedSum / usedWeight;
  }

  const availablePrices = Object.values(periodPrices).filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0
  );

  if (availablePrices.length) {
    return availablePrices.reduce((acc, value) => acc + value, 0) / availablePrices.length;
  }

  return undefined;
}

function resolveSavingsRate(
  explicitRate: number | undefined,
  weightedEnergyPrice: number | undefined,
  fallbackField: number
): number {
  const cleanExplicit = normalizePositive(explicitRate, 0);
  if (cleanExplicit > 0 && cleanExplicit <= 5) {
    return cleanExplicit;
  }

  if (typeof weightedEnergyPrice === "number" && weightedEnergyPrice > 0) {
    return weightedEnergyPrice;
  }

  // Solo usar el campo original como tarifa energética si es razonable
  const fallback = normalizePositive(fallbackField, 0);
  if (fallback > 0 && fallback <= 5) {
    return fallback;
  }

  // Fallback conservador realista
  return 0.18;
}

function buildPeriodDistribution(
  billType: BillType,
  invoiceConsumptionKwh: number
): {
  distribution: Record<PeriodKey, number>;
  percentages: Record<PeriodKey, number>;
} {
  const percentages = PERIOD_PERCENTAGES[billType];

  const distribution = ALL_PERIODS.reduce(
    (acc, period) => {
      acc[period] = round(invoiceConsumptionKwh * percentages[period], 2);
      return acc;
    },
    {} as Record<PeriodKey, number>
  );

  return { distribution, percentages };
}

export const calculateEnergyStudy = (
  input: CalculationInput
): CalculationResult => {
  const billType = input.billType;
  const effectiveHours = Math.max(1, normalizePositive(input.effectiveHours, 1));
  const selfConsumptionRatio = normalizeRatio(input.selfConsumptionRatio);

  // 1. Consumo medio mensual:
  // Si hay históricos de gráfica, hacemos media; si no, usamos el valor recibido.
  const graphAverage = averageValid(input.monthlyChartConsumptions);
  const averageMonthlyConsumptionKwh = round(
    graphAverage ??
      normalizePositive(input.monthlyConsumptionKwh, 0) ??
      normalizePositive(input.invoiceConsumptionKwh, 0)
  );

  const invoiceConsumptionKwh = round(
    normalizePositive(
      input.invoiceConsumptionKwh,
      averageMonthlyConsumptionKwh
    )
  );

  // 2. Consumo anual
  const annualConsumptionKwh = round(averageMonthlyConsumptionKwh * 12);

  // 3. Potencia recomendada kWp
  // Consumo anual / horas efectivas
  // Redondeada siempre hacia arriba en escalones de 0,5
  const rawPower = annualConsumptionKwh / effectiveHours;
  const recommendedPowerKwp = roundUpToHalf(rawPower);

  // 4. Inversión €
  const investmentCost = round(
    recommendedPowerKwp * normalizePositive(input.investmentCostKwh, 0)
  );

  // 5. Servicio €
  const serviceCost = round(
    recommendedPowerKwp * normalizePositive(input.serviceCostKwh, 0)
  );

  // 6. Precio medio de energía detectado en la factura
  const weightedEnergyPriceKwh = round(
    resolveWeightedEnergyPrice(billType, input.periodPrices) ?? 0.18,
    5
  );

  // 7. Tarifa de ahorro real usada para evitar cifras irreales
  const weightedInvestmentSavingsRateKwh = round(
    resolveSavingsRate(
      input.savingsRateInvestmentKwh,
      weightedEnergyPriceKwh,
      input.investmentCostKwh
    ),
    5
  );

  const weightedServiceSavingsRateKwh = round(
    resolveSavingsRate(
      input.savingsRateServiceKwh,
      weightedEnergyPriceKwh,
      input.serviceCostKwh
    ),
    5
  );

  // 8. Producción anual estimada
  const estimatedAnnualProductionKwh = round(
    effectiveHours * recommendedPowerKwp
  );

  // 9. Ahorro anual realista
  // Ahorro = producción anual * % autoconsumo * tarifa de ahorro €/kWh
  const annualSavingsInvestment = round(
    estimatedAnnualProductionKwh *
      selfConsumptionRatio *
      weightedInvestmentSavingsRateKwh
  );

  const annualSavingsService = round(
    estimatedAnnualProductionKwh *
      selfConsumptionRatio *
      weightedServiceSavingsRateKwh
  );

  const monthlySavingsInvestment = round(annualSavingsInvestment / 12);
  const monthlySavingsService = round(annualSavingsService / 12);

  const dailySavingsInvestment = round(annualSavingsInvestment / 365);
  const dailySavingsService = round(annualSavingsService / 365);

  const annualSavings25YearsInvestment = round(annualSavingsInvestment * 25);
  const annualSavings25YearsService = round(annualSavingsService * 25);

  const estimatedMonthlyEnergyCost = round(
    averageMonthlyConsumptionKwh * weightedEnergyPriceKwh
  );

  const estimatedAnnualEnergyCost = round(
    annualConsumptionKwh * weightedEnergyPriceKwh
  );

  const paybackYears =
    annualSavingsInvestment > 0
      ? round(investmentCost / annualSavingsInvestment, 1)
      : null;

  const { distribution, percentages } = buildPeriodDistribution(
    billType,
    invoiceConsumptionKwh
  );

  const viabilityScore = Math.min(
    100,
    Math.round(
      Math.min(40, annualConsumptionKwh / 120) +
        Math.min(30, effectiveHours / 60) +
        Math.min(30, selfConsumptionRatio * 100 * 0.3)
    )
  );

  return {
    annualConsumptionKwh,
    averageMonthlyConsumptionKwh,
    invoiceConsumptionKwh,

    recommendedPowerKwp,

    investmentCost,
    serviceCost,

    annualSavingsInvestment,
    annualSavingsService,

    monthlySavingsInvestment,
    monthlySavingsService,

    dailySavingsInvestment,
    dailySavingsService,

    annualSavings25YearsInvestment,
    annualSavings25YearsService,

    estimatedAnnualProductionKwh,
    estimatedMonthlyEnergyCost,
    estimatedAnnualEnergyCost,

    weightedEnergyPriceKwh,
    weightedInvestmentSavingsRateKwh,
    weightedServiceSavingsRateKwh,

    selfConsumptionRatio,
    viabilityScore,
    paybackYears,

    periodDistribution: distribution,
    periodPercentages: percentages,

    charts: {
      savingsProjectionInvestment: [
        { label: "Día", value: dailySavingsInvestment },
        { label: "Mes", value: monthlySavingsInvestment },
        { label: "Año", value: annualSavingsInvestment },
      ],
      savingsProjectionService: [
        { label: "Día", value: dailySavingsService },
        { label: "Mes", value: monthlySavingsService },
        { label: "Año", value: annualSavingsService },
      ],
      periodDistribution: ALL_PERIODS.filter(
        (period) => percentages[period] > 0
      ).map((period) => ({
        label: period,
        value: distribution[period],
        percentage: round(percentages[period] * 100, 1),
      })),
    },

    formulaVersion: "2.0.0",
  };
};