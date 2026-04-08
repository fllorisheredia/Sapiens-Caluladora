export type BillType = "2TD" | "3TD";
export type PeriodKey = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export interface CalculationInput {
  monthlyConsumptionKwh: number;
  billType: BillType;
  effectiveHours: number;

  investmentCostKwh: number;
  serviceCostKwh: number;
  selfConsumptionRatio: number;

  invoiceConsumptionKwh?: number;
  monthlyChartConsumptions?: number[];
  periodPrices?: Partial<Record<PeriodKey, number>>;
  periodConsumptions?: Partial<Record<PeriodKey, number>>;

  savingsRateInvestmentKwh?: number;
  savingsRateServiceKwh?: number;

  surplusCompensationPriceKwh?: number;
  maintenanceAnnualPerKwp?: number;
  vatRate?: number;

  invoiceVariableEnergyAmountEur?: number;

  // Si llega > 0, esta potencia manda sobre la calculada automática
  forcedPowerKwp?: number;
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

  // Alias útiles para no romper otras partes del proyecto
  totalSavings25YearsInvestment: number;
  totalSavings25YearsService: number;

  estimatedAnnualProductionKwh: number;
  estimatedMonthlyEnergyCost: number;
  estimatedAnnualEnergyCost: number;

  weightedEnergyPriceKwh: number;
  weightedInvestmentSavingsRateKwh: number;
  weightedServiceSavingsRateKwh: number;

  selfConsumptionRatio: number;
  viabilityScore: number;
  paybackYears: number | null;

  // Nuevos campos detallados
  invoicePriceWithVatKwh: number;
  surplusCompensationPriceKwh: number;

  annualSelfConsumedEnergyKwh: number;
  annualSurplusEnergyKwh: number;

  annualSelfConsumptionValue: number;
  annualSurplusValue: number;
  annualGrossSolarValue: number;

  annualMaintenanceCost: number;
  annualServiceFee: number;

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

const DEFAULT_WEIGHTED_ENERGY_PRICE_KWH = 0.18;
const DEFAULT_MAINTENANCE_ANNUAL_PER_KWP = 36;
const DEFAULT_VAT_RATE = 0.21;
const DEFAULT_SURPLUS_COMPENSATION_PRICE_KWH = 0;

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
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

function clampRatio(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function roundUpToHalf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 2) / 2;
}

function averageValid(values?: number[]): number | undefined {
  if (!Array.isArray(values)) return undefined;

  const clean = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (!clean.length) return undefined;

  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function resolveWeightedEnergyPrice(
  billType: BillType,
  periodPrices?: Partial<Record<PeriodKey, number>>,
  periodConsumptions?: Partial<Record<PeriodKey, number>>,
  invoiceVariableEnergyAmountEur?: number,
  invoiceConsumptionKwh?: number,
): number | undefined {
  const validInvoiceConsumption =
    typeof invoiceConsumptionKwh === "number" &&
    Number.isFinite(invoiceConsumptionKwh) &&
    invoiceConsumptionKwh > 0;

  const validVariableAmount =
    typeof invoiceVariableEnergyAmountEur === "number" &&
    Number.isFinite(invoiceVariableEnergyAmountEur) &&
    invoiceVariableEnergyAmountEur > 0;

  // 1) Mejor opción: precio real medio de la factura
  if (validVariableAmount && validInvoiceConsumption) {
    return invoiceVariableEnergyAmountEur / invoiceConsumptionKwh;
  }

  // 2) Segunda mejor opción: ponderar con consumos reales por periodo
  if (periodPrices && periodConsumptions) {
    let totalCost = 0;
    let totalKwh = 0;

    for (const period of ALL_PERIODS) {
      const price = periodPrices[period];
      const kwh = periodConsumptions[period];

      if (
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0 &&
        typeof kwh === "number" &&
        Number.isFinite(kwh) &&
        kwh > 0
      ) {
        totalCost += price * kwh;
        totalKwh += kwh;
      }
    }

    if (totalKwh > 0) {
      return totalCost / totalKwh;
    }
  }

  // 3) Fallback antiguo
  if (periodPrices) {
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
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );

    if (availablePrices.length) {
      return (
        availablePrices.reduce((acc, value) => acc + value, 0) /
        availablePrices.length
      );
    }
  }

  return undefined;
}

function buildPeriodDistribution(
  billType: BillType,
  invoiceConsumptionKwh: number,
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
    {} as Record<PeriodKey, number>,
  );

  return { distribution, percentages };
}

export const calculateEnergyStudy = (
  input: CalculationInput,
): CalculationResult => {
  const billType = input.billType;

  const effectiveHours = Math.max(1, normalizePositive(input.effectiveHours, 1));
  const selfConsumptionRatio = clampRatio(
    normalizeRatio(input.selfConsumptionRatio),
  );

  const graphAverage = averageValid(input.monthlyChartConsumptions);

  const averageMonthlyConsumptionKwh = round(
    graphAverage ??
      normalizePositive(input.monthlyConsumptionKwh, 0) ??
      normalizePositive(input.invoiceConsumptionKwh, 0),
  );

  const invoiceConsumptionKwh = round(
    normalizePositive(input.invoiceConsumptionKwh, averageMonthlyConsumptionKwh),
  );

  const annualConsumptionKwh = round(averageMonthlyConsumptionKwh * 12);

  // Potencia recomendada automática
  const rawPower = annualConsumptionKwh / effectiveHours;
  const calculatedPowerKwp = roundUpToHalf(rawPower);

  // Si llega una potencia fija > 0, manda sobre la calculada
  const forcedPowerKwp = normalizePositive(input.forcedPowerKwp, 0);

  const recommendedPowerKwp =
    forcedPowerKwp > 0 ? round(forcedPowerKwp, 2) : calculatedPowerKwp;

  // Precio medio detectado en factura
  const weightedEnergyPriceKwh = round(
    resolveWeightedEnergyPrice(
      billType,
      input.periodPrices,
      input.periodConsumptions,
      input.invoiceVariableEnergyAmountEur,
      invoiceConsumptionKwh,
    ) ?? DEFAULT_WEIGHTED_ENERGY_PRICE_KWH,
    5,
  );

  // Precio factura con IVA
  const vatRate = normalizePositive(input.vatRate, DEFAULT_VAT_RATE);
  const invoicePriceWithVatKwh = round(weightedEnergyPriceKwh * (1 + vatRate), 5);

  // Precio excedentes
  const surplusCompensationPriceKwh = round(
    normalizePositive(
      input.surplusCompensationPriceKwh,
      DEFAULT_SURPLUS_COMPENSATION_PRICE_KWH,
    ),
    5,
  );

  // Producción anual estimada
  const estimatedAnnualProductionKwh = round(
    effectiveHours * recommendedPowerKwp,
  );

  const annualSelfConsumedEnergyKwh = round(
    Math.min(
      estimatedAnnualProductionKwh * selfConsumptionRatio,
      annualConsumptionKwh,
    ),
  );

  const annualSurplusEnergyKwh = round(
    Math.max(estimatedAnnualProductionKwh - annualSelfConsumedEnergyKwh, 0),
  );

  // Valor económico bruto
  const annualSelfConsumptionValue = round(
    annualSelfConsumedEnergyKwh * invoicePriceWithVatKwh,
  );

  const annualSurplusValue = round(
    annualSurplusEnergyKwh * surplusCompensationPriceKwh,
  );

  const annualGrossSolarValue = round(
    annualSelfConsumptionValue + annualSurplusValue,
  );

  // Costes anuales
  const maintenanceAnnualPerKwp = normalizePositive(
    input.maintenanceAnnualPerKwp,
    DEFAULT_MAINTENANCE_ANNUAL_PER_KWP,
  );

  const annualMaintenanceCost = round(
    maintenanceAnnualPerKwp * recommendedPowerKwp,
  );

  // En servicio tomamos la cuota anual como producción anual * coste servicio €/kWh
  const annualServiceFee = round(
    estimatedAnnualProductionKwh * normalizePositive(input.serviceCostKwh, 0),
  );

  // Costes resumen
  // Inversión: mantenemos el base cost para referencia
  const investmentCost = round(
    recommendedPowerKwp * normalizePositive(input.investmentCostKwh, 0),
  );

  // Servicio: dejamos el coste anual del servicio
  const serviceCost = round(annualServiceFee);

  // Ahorro anual inversión
  // valor anual generado - mantenimiento anual
  const annualSavingsInvestment = round(
    Math.max(annualGrossSolarValue - annualMaintenanceCost, 0),
  );

  // Ahorro anual servicio
  // Se compara contra lo que hoy paga de factura al año
  const estimatedMonthlyEnergyCost = round(
    averageMonthlyConsumptionKwh * invoicePriceWithVatKwh,
  );

  const estimatedAnnualEnergyCost = round(
    annualConsumptionKwh * invoicePriceWithVatKwh,
  );

  const annualSavingsService = round(
    Math.max(estimatedAnnualEnergyCost - annualServiceFee, 0),
  );

  const monthlySavingsInvestment = round(annualSavingsInvestment / 12);
  const monthlySavingsService = round(annualSavingsService / 12);

  const dailySavingsInvestment = round(annualSavingsInvestment / 365);
  const dailySavingsService = round(annualSavingsService / 365);

  const annualSavings25YearsInvestment = round(annualSavingsInvestment * 25);
  const annualSavings25YearsService = round(annualSavingsService * 25);

  const totalSavings25YearsInvestment = annualSavings25YearsInvestment;
  const totalSavings25YearsService = annualSavings25YearsService;

  // Estas tarifas se dejan para compatibilidad con el resto de la app
  const weightedInvestmentSavingsRateKwh = invoicePriceWithVatKwh;
  const weightedServiceSavingsRateKwh = invoicePriceWithVatKwh;

  const paybackYears =
    annualSavingsInvestment > 0
      ? round(investmentCost / annualSavingsInvestment, 1)
      : null;

  const { distribution, percentages } = buildPeriodDistribution(
    billType,
    invoiceConsumptionKwh,
  );

  const viabilityScore = Math.min(
    100,
    Math.round(
      Math.min(40, annualConsumptionKwh / 120) +
        Math.min(30, effectiveHours / 60) +
        Math.min(30, selfConsumptionRatio * 100 * 0.3),
    ),
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

    totalSavings25YearsInvestment,
    totalSavings25YearsService,

    estimatedAnnualProductionKwh,
    estimatedMonthlyEnergyCost,
    estimatedAnnualEnergyCost,

    weightedEnergyPriceKwh,
    weightedInvestmentSavingsRateKwh,
    weightedServiceSavingsRateKwh,

    selfConsumptionRatio,
    viabilityScore,
    paybackYears,

    invoicePriceWithVatKwh,
    surplusCompensationPriceKwh,

    annualSelfConsumedEnergyKwh,
    annualSurplusEnergyKwh,

    annualSelfConsumptionValue,
    annualSurplusValue,
    annualGrossSolarValue,

    annualMaintenanceCost,
    annualServiceFee,

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
        (period) => percentages[period] > 0,
      ).map((period) => ({
        label: period,
        value: distribution[period],
        percentage: round(percentages[period] * 100, 1),
      })),
    },

    formulaVersion: "3.1.0",
  };
};