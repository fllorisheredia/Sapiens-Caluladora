import React, { useEffect, useRef, useState } from "react";
import Layout from "./components/shared/Layout";
import FileUploader from "./components/shared/FileUploader";
import Button from "./components/ui/Button";
import Input from "./components/ui/Input";
import AdminLogin from "./components/admin/AdminLogin";
import AdminDashboard from "./components/admin/AdminDashboard";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BillDataSchema, type BillData } from "./lib/validators";
import { motion, AnimatePresence } from "motion/react";
import { extractBillFromApi } from "./services/extractionApiService";
import type { ExtractedBillData } from "./services/geminiService";
import { confirmStudy } from "./services/confirmStudyService";
import { z } from "zod";
import {
  Check,
  MapPin,
  Zap,
  FileText,
  ArrowRight,
  Loader2,
  Download,
  Mail,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Leaf,
  Upload,
  Building2,
  BatteryCharging,
} from "lucide-react";
import { sileo } from "sileo";
import axios from "axios";
import {
  calculateEnergyStudy,
  type CalculationResult,
} from "./modules/calculation/energyService";
import { formatCurrency, formatNumber, cn } from "./lib/utils";
import {
  generateStudyPDF,
  type ProposalPdfSummary,
} from "./modules/pdf/pdfService"; // import { sendStudyByEmail } from "./modules/email/emailService";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type Step = "upload" | "validation" | "map" | "calculation" | "result";

interface ApiInstallation {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  horas_efectivas: number;
  potencia_instalada_kwp: number;
  almacenamiento_kwh: number;
  coste_anual_mantenimiento_por_kwp: number;
  coste_kwh_inversion: number;
  coste_kwh_servicio: number;
  porcentaje_autoconsumo: number;
  modalidad: "inversion" | "servicio" | "ambas";
  active: boolean;
  created_at?: string;
  updated_at?: string;
  distance_meters?: number;
}

const BILL_TYPES = ["2TD", "3TD"] as const;
type ValidationBillType = (typeof BILL_TYPES)[number];

const isBillType = (value: unknown): value is ValidationBillType => {
  return value === "2TD" || value === "3TD";
};

const parseFormNumber = (value: unknown): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return undefined;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
};

function roundUpToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

function normalizeAndRoundUp(
  value: unknown,
  decimals: number,
): number | undefined {
  const parsed = parseFormNumber(value);

  if (parsed === undefined || Number.isNaN(parsed)) return undefined;

  return roundUpToDecimals(parsed, decimals);
}

type ProposalMode = "investment" | "service" | "comparison";

type StudyComparisonResult = {
  investment: CalculationResult;
  service: CalculationResult;
};

const requiredNumberField = z.preprocess(
  (value) => parseFormNumber(value),
  z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? "Este campo es obligatorio"
          : "Debe ser un número válido",
    })
    .min(0, { error: "Debe ser un número válido" }),
);

const optionalNumberField = z.preprocess(
  (value) => parseFormNumber(value),
  z
    .number({
      error: "Debe ser un número válido",
    })
    .min(0, { error: "Debe ser un número válido" })
    .optional(),
);

const ValidationBillDataSchema = BillDataSchema.extend({
  monthlyConsumption: requiredNumberField,
  billType: z.enum(BILL_TYPES, {
    error: "Selecciona el tipo de factura",
  }),
  currentInvoiceConsumptionKwh: requiredNumberField,
  averageMonthlyConsumptionKwh: requiredNumberField,

  periodConsumptionP1: optionalNumberField,
  periodConsumptionP2: optionalNumberField,
  periodConsumptionP3: optionalNumberField,
  periodConsumptionP4: optionalNumberField,
  periodConsumptionP5: optionalNumberField,
  periodConsumptionP6: optionalNumberField,

  periodPriceP1: optionalNumberField,
  periodPriceP2: optionalNumberField,
  periodPriceP3: optionalNumberField,
  periodPriceP4: optionalNumberField,
  periodPriceP5: optionalNumberField,
  periodPriceP6: optionalNumberField,
});

type ValidationBillDataFormInput = z.input<typeof ValidationBillDataSchema>;
type ValidationBillData = z.output<typeof ValidationBillDataSchema>;

function buildLastName(
  lastname1: string | null | undefined,
  lastname2: string | null | undefined,
): string {
  return [lastname1, lastname2].filter(Boolean).join(" ").trim();
}

function normalizeSelfConsumption(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.7;
  return value > 1 ? value / 100 : value;
}

function displayPercentage(value: number | null | undefined): number {
  const normalized = normalizeSelfConsumption(value);
  return Math.round(normalized * 100);
}

function mapExtractedToBillData(
  data: ExtractedBillData,
): Partial<ValidationBillData> {
  const fullLastName = buildLastName(
    data.customer.lastname1,
    data.customer.lastname2,
  );

  const rawBillType = data.invoice_data.type;
  const safeBillType = isBillType(rawBillType) ? rawBillType : undefined;

  return {
    name: data.customer.name ?? "",
    lastName: fullLastName,
    dni: data.customer.dni ?? "",
    cups: data.customer.cups ?? "",
    address: data.location.address ?? "",
    email: data.customer.email ?? "",
    phone: data.customer.phone ?? "",
    iban: data.customer.iban ?? "",
    billType: safeBillType,

    monthlyConsumption: normalizeAndRoundUp(
      data.invoice_data.averageMonthlyConsumptionKwh ??
        data.invoice_data.currentInvoiceConsumptionKwh ??
        data.invoice_data.consumptionKwh,
      2,
    ),

    currentInvoiceConsumptionKwh: normalizeAndRoundUp(
      data.invoice_data.currentInvoiceConsumptionKwh ??
        data.invoice_data.consumptionKwh,
      2,
    ),

    averageMonthlyConsumptionKwh: normalizeAndRoundUp(
      data.invoice_data.averageMonthlyConsumptionKwh,
      2,
    ),

    periodConsumptionP1: normalizeAndRoundUp(data.invoice_data.periods?.P1, 2),
    periodConsumptionP2: normalizeAndRoundUp(data.invoice_data.periods?.P2, 2),
    periodConsumptionP3: normalizeAndRoundUp(data.invoice_data.periods?.P3, 2),
    periodConsumptionP4: normalizeAndRoundUp(data.invoice_data.periods?.P4, 2),
    periodConsumptionP5: normalizeAndRoundUp(data.invoice_data.periods?.P5, 2),
    periodConsumptionP6: normalizeAndRoundUp(data.invoice_data.periods?.P6, 2),

    periodPriceP1: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P1,
      5,
    ),
    periodPriceP2: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P2,
      5,
    ),
    periodPriceP3: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P3,
      5,
    ),
    periodPriceP4: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P4,
      5,
    ),
    periodPriceP5: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P5,
      5,
    ),
    periodPriceP6: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P6,
      5,
    ),
  };
}

function toBaseBillData(data: Partial<ValidationBillData>): BillData {
  return {
    name: data.name ?? "",
    lastName: data.lastName ?? "",
    dni: data.dni ?? "",
    cups: data.cups ?? "",
    address: data.address ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    monthlyConsumption:
      data.averageMonthlyConsumptionKwh ?? data.monthlyConsumption ?? 0,
    billType: (data.billType ?? "2TD") as BillData["billType"],
    iban: data.iban ?? "",
  };
}

function showExtractionToasts(extraction: ExtractedBillData) {
  let delay = 0;

  const queueInfo = (title: string, description?: string) => {
    window.setTimeout(() => {
      sileo.info({ title, description });
    }, delay);
    delay += 220;
  };

  const queueError = (title: string, description?: string) => {
    window.setTimeout(() => {
      sileo.error({ title, description });
    }, delay);
    delay += 220;
  };

  if (extraction.extraction.fallbackUsed) {
    queueInfo(
      "Extracción completada con apoyo del fallback",
      "Revisa los datos detectados antes de continuar.",
    );
  }

  if (extraction.customer.ibanNeedsCompletion) {
    queueInfo(
      "Revisión del IBAN",
      "La factura oculta parte del IBAN con asteriscos. El cliente debe completar manualmente los dígitos faltantes.",
    );
  }

  extraction.extraction.warnings.slice(0, 4).forEach((warning, index) => {
    queueInfo(`Aviso ${index + 1}`, warning);
  });

  if (extraction.extraction.manualReviewFields?.length) {
    const fields = extraction.extraction.manualReviewFields
      .slice(0, 4)
      .join(", ");

    queueError(
      "Campos que requieren revisión",
      `Comprueba manualmente estos campos: ${fields}`,
    );
  }

  if (extraction.extraction.missingFields?.length) {
    queueInfo(
      "Campos incompletos",
      `Hay ${extraction.extraction.missingFields.length} campos que pueden necesitar revisión manual.`,
    );
  }
}

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
        {subtitle ? (
          <p className="text-sm text-brand-gray mt-1">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

type PdfArtifact =
  | Blob
  | Uint8Array
  | ArrayBuffer
  | {
      save: (fileName?: string) => void;
      output?: (type?: string) => unknown;
    }
  | null
  | undefined;

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function hasSaveMethod(value: unknown): value is {
  save: (fileName?: string) => void;
  output?: (type?: string) => unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "save" in value &&
    typeof (value as { save?: unknown }).save === "function"
  );
}

function uint8ArrayToArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

const buildPdfArtifact = async (
  billData: BillData,
  calculationResult: CalculationResult,
  proposal: ProposalPdfSummary,
): Promise<PdfArtifact> => {
  const result = await generateStudyPDF(billData, calculationResult, proposal);
  return result as PdfArtifact;
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function savePdfArtifactLocally(pdfArtifact: PdfArtifact, fileName: string) {
  if (!pdfArtifact) {
    throw new Error("No se pudo generar el PDF");
  }

  if (hasSaveMethod(pdfArtifact)) {
    pdfArtifact.save(fileName);
    return;
  }

  if (isBlob(pdfArtifact)) {
    downloadBlob(pdfArtifact, fileName);
    return;
  }

  if (isUint8Array(pdfArtifact)) {
    const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
    downloadBlob(new Blob([buffer], { type: "application/pdf" }), fileName);
    return;
  }

  if (isArrayBuffer(pdfArtifact)) {
    downloadBlob(
      new Blob([pdfArtifact], { type: "application/pdf" }),
      fileName,
    );
    return;
  }

  throw new Error("Formato de PDF no soportado");
}

function pdfArtifactToBlob(pdfArtifact: PdfArtifact): Blob {
  if (!pdfArtifact) {
    throw new Error("No se pudo generar el PDF");
  }

  if (isBlob(pdfArtifact)) {
    return pdfArtifact;
  }

  if (isUint8Array(pdfArtifact)) {
    const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
    return new Blob([buffer], { type: "application/pdf" });
  }

  if (isArrayBuffer(pdfArtifact)) {
    return new Blob([pdfArtifact], { type: "application/pdf" });
  }

  if (hasSaveMethod(pdfArtifact) && typeof pdfArtifact.output === "function") {
    const output = pdfArtifact.output("blob");

    if (output instanceof Blob) {
      return output;
    }

    if (output instanceof Uint8Array) {
      const buffer = uint8ArrayToArrayBuffer(output);
      return new Blob([buffer], { type: "application/pdf" });
    }

    if (output instanceof ArrayBuffer) {
      return new Blob([output], { type: "application/pdf" });
    }
  }

  throw new Error("Formato de PDF no soportado");
}

// async function sendStudyEmailWithFallback(params: {
//   to: string;
//   customerName: string;
//   billData: BillData;
//   calculationResult: CalculationResult;
//   pdfArtifact: PdfArtifact;
// }) {
//   const { to, customerName, billData, calculationResult, pdfArtifact } = params;

//   let attachment: Blob | undefined;

//   if (isBlob(pdfArtifact)) {
//     attachment = pdfArtifact; // Si el pdfArtifact es un Blob, lo usamos directamente.
//   } else if (isUint8Array(pdfArtifact)) {
//     const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
//     attachment = new Blob([buffer], { type: "application/pdf" });
//   } else if (isArrayBuffer(pdfArtifact)) {
//     attachment = new Blob([pdfArtifact], { type: "application/pdf" });
//   }

//   await sendStudyByEmail({
//     to,
//     customerName,
//     attachment, // Aquí adjuntamos el PDF
//     billData,
//     calculationResult,
//   });
// }
type ProposalCardData = {
  id: "investment" | "service";
  title: string;
  badge: string;
  annualSavings: number;
  totalSavings25Years: number;
  upfrontCost: number;
  monthlyFee: number | null;
  annualMaintenance: number;
  monthlyMaintenance: number | null;
  paybackYears: number;
  recommendedPowerKwp: number;
  annualConsumptionKwh: number;
  description: string;
  valuePoints: string[];
};

function getFirstNumericField(
  source: unknown,
  keys: string[],
  fallback = 0,
): number {
  if (!source || typeof source !== "object") return fallback;

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function getServiceMonthlyFeeFromInstallation(
  installation: ApiInstallation | null,
  annualConsumptionKwh: number,
): number | null {
  if (!installation) return null;

  const directMonthlyFee = getFirstNumericField(
    installation,
    [
      "serviceMonthlyFee",
      "monthlyServiceFee",
      "precio_mensual_servicio",
      "cuota_mensual_servicio",
    ],
    Number.NaN,
  );

  if (Number.isFinite(directMonthlyFee)) {
    return directMonthlyFee;
  }

  const serviceCostPerKwh = installation.coste_kwh_servicio;

  if (
    typeof serviceCostPerKwh === "number" &&
    Number.isFinite(serviceCostPerKwh) &&
    annualConsumptionKwh > 0
  ) {
    return (annualConsumptionKwh * serviceCostPerKwh) / 12;
  }

  return null;
}

function getInvestmentCostFromFormula(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  if (!installation) return 0;

  const effectiveHours = Number(installation.horas_efectivas ?? 0);

  if (
    !Number.isFinite(recommendedPowerKwp) ||
    recommendedPowerKwp <= 0 ||
    !Number.isFinite(effectiveHours) ||
    effectiveHours <= 0
  ) {
    return 0;
  }

  return 0.06 * recommendedPowerKwp * effectiveHours * 25;
}

function getServiceMonthlyFeeFromFormula(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number | null {
  if (!installation) return null;

  const effectiveHours = Number(installation.horas_efectivas ?? 0);

  if (
    !Number.isFinite(recommendedPowerKwp) ||
    recommendedPowerKwp <= 0 ||
    !Number.isFinite(effectiveHours) ||
    effectiveHours <= 0
  ) {
    return null;
  }

  return (0.08 * recommendedPowerKwp * effectiveHours) / 12;
}

function getAnnualMaintenanceFromInstallation(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  if (!installation) return 0;

  const directAnnualMaintenance = getFirstNumericField(
    installation,
    [
      "annualMaintenance",
      "maintenanceAnnual",
      "mantenimiento_anual",
      "coste_anual_mantenimiento",
    ],
    Number.NaN,
  );

  if (Number.isFinite(directAnnualMaintenance)) {
    return directAnnualMaintenance;
  }

  const maintenancePerKwp = installation.coste_anual_mantenimiento_por_kwp;

  if (
    typeof maintenancePerKwp === "number" &&
    Number.isFinite(maintenancePerKwp) &&
    recommendedPowerKwp > 0
  ) {
    return maintenancePerKwp * recommendedPowerKwp;
  }

  return 0;
}

function buildProposalCardData(
  result: CalculationResult | null,
  mode: "investment" | "service",
  installation: ApiInstallation | null,
): ProposalCardData {
  const recommendedPowerKwp = getFirstNumericField(result, [
    "recommendedPowerKwp",
  ]);

  const annualConsumptionKwh = getFirstNumericField(result, [
    "annualConsumptionKwh",
  ]);

  const annualMaintenance = getAnnualMaintenanceFromInstallation(
    installation,
    recommendedPowerKwp,
  );

  const monthlyMaintenance =
    annualMaintenance > 0 ? annualMaintenance / 12 : null;

  if (mode === "investment") {
    const annualSavings = getFirstNumericField(result, [
      "annualSavingsInvestment",
      "annualSavings",
    ]);

    const upfrontCost = getInvestmentCostFromFormula(
      installation,
      recommendedPowerKwp,
    );

    const totalSavings25Years = getFirstNumericField(
      result,
      [
        "totalSavings25YearsInvestment",
        "investmentSavings25Years",
        "totalSavings25Years",
      ],
      annualSavings * 25,
    );

    const paybackYears = annualSavings > 0 ? upfrontCost / annualSavings : 0;

    return {
      id: "investment",
      title: "Inversión",
      badge: "Mayor rentabilidad",
      annualSavings,
      totalSavings25Years,
      upfrontCost,
      monthlyFee: null,
      annualMaintenance,
      monthlyMaintenance,
      paybackYears,
      recommendedPowerKwp,
      annualConsumptionKwh,
      description: "Realizas la inversión y maximizas el ahorro a largo plazo.",
      valuePoints: [
        "Mayor ahorro acumulado en 25 años",
        "Más control sobre la rentabilidad del proyecto",
        "Ideal si buscas retorno económico sostenido",
        "Sin cuota mensual recurrente",
      ],
    };
  }

  const annualSavings = getFirstNumericField(result, [
    "annualSavingsService",
    "serviceAnnualSavings",
    "annualSavings",
    "annualSavingsInvestment",
  ]);

  const totalSavings25Years = getFirstNumericField(
    result,
    [
      "totalSavings25YearsService",
      "serviceSavings25Years",
      "serviceTotalSavings25Years",
    ],
    annualSavings * 25,
  );

  const monthlyFee = getServiceMonthlyFeeFromFormula(
    installation,
    recommendedPowerKwp,
  );

  const paybackYears = getFirstNumericField(result, [
    "servicePaybackYears",
    "paybackYearsService",
  ]);

  return {
    id: "service",
    title: "Servicio",
    badge: "Menor entrada",
    annualSavings,
    totalSavings25Years,
    upfrontCost: 0,
    monthlyFee,
    annualMaintenance,
    monthlyMaintenance,
    paybackYears,
    recommendedPowerKwp,
    annualConsumptionKwh,
    description:
      "Modelo pensado para reducir la barrera de entrada y facilitar la contratación.",
    valuePoints: [
      "Menor desembolso inicial",
      "Cuota mensual estimada más clara",
      "Ideal si priorizas liquidez inmediata",
      "Entrada más cómoda para el cliente",
    ],
  };
}

function buildProposalPdfSummary(
  proposal: ProposalCardData,
): ProposalPdfSummary {
  return {
    mode: proposal.id,
    title: proposal.title,
    badge: proposal.badge,
    annualSavings: proposal.annualSavings,
    totalSavings25Years: proposal.totalSavings25Years,
    upfrontCost: proposal.upfrontCost,
    monthlyFee: proposal.monthlyFee,
    annualMaintenance: proposal.annualMaintenance,
    paybackYears: proposal.paybackYears,
    recommendedPowerKwp: proposal.recommendedPowerKwp,
    annualConsumptionKwh: proposal.annualConsumptionKwh,
    description: proposal.description,
  };
}

// function getClientCoords(rawExtraction: ExtractedBillData | null): {
//   lat: number;
//   lng: number;
// } | null {
//   const lat = Number(
//     rawExtraction?.location?.lat ?? rawExtraction?.location?.latitude,
//   );

//   const lng = Number(
//     rawExtraction?.location?.lng ??
//       rawExtraction?.location?.lon ??
//       rawExtraction?.location?.longitude,
//   );

//   if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

//   return { lat, lng };
// }

function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
} | null> {
  const normalizedAddress = normalizeAddressForGeocoding(address);

  if (!normalizedAddress) return null;

  const response = await axios.post("/api/geocode-address", {
    address: normalizedAddress,
  });

  const coords = response.data?.coords;

  if (
    !coords ||
    !Number.isFinite(Number(coords.lat)) ||
    !Number.isFinite(Number(coords.lng))
  ) {
    return null;
  }

  return {
    lat: Number(coords.lat),
    lng: Number(coords.lng),
  };
}
export default function App() {
  const [view, setView] = useState<"public" | "admin">("public");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [extractedData, setExtractedData] =
    useState<Partial<ValidationBillData> | null>(null);
  const [rawExtraction, setRawExtraction] = useState<ExtractedBillData | null>(
    null,
  );
  const [proposalResults, setProposalResults] =
    useState<StudyComparisonResult | null>(null);

  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [selectedProposalView, setSelectedProposalView] =
    useState<ProposalMode>("investment");

  const investmentResult = proposalResults?.investment ?? null;
  const serviceResult =
    proposalResults?.service ?? proposalResults?.investment ?? null;

  const activeProposalMode: "investment" | "service" =
    selectedProposalView === "service" ? "service" : "investment";
  const [selectedInstallation, setSelectedInstallation] =
    useState<ApiInstallation | null>(null);

  const activeCalculationResult =
    activeProposalMode === "service"
      ? (serviceResult ?? investmentResult)
      : investmentResult;

  const investmentProposal = buildProposalCardData(
    investmentResult,
    "investment",
    selectedInstallation,
  );
  const [clientCoordinates, setClientCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const clientCoords = clientCoordinates;
  const getMonthlyFeeLabel = (
    proposal: ProposalCardData,
    isInvestment = false,
  ) => {
    if (isInvestment) return "Sin cuota";

    return proposal.monthlyFee && proposal.monthlyFee > 0
      ? `${formatCurrency(proposal.monthlyFee)} / mes`
      : "Consultar";
  };

  const getPaybackLabel = (proposal: ProposalCardData) => {
    return proposal.paybackYears > 0
      ? `${proposal.paybackYears.toFixed(1)} años`
      : "-";
  };

  const getProposalMetrics = (proposal: ProposalCardData) => ({
    annualSavings: formatCurrency(proposal.annualSavings),
    totalSavings25Years: formatCurrency(proposal.totalSavings25Years),
    upfrontCost: formatCurrency(proposal.upfrontCost),
    monthlyFee: getMonthlyFeeLabel(proposal, proposal.id === "investment"),
    payback: getPaybackLabel(proposal),
  });

  const serviceProposal = buildProposalCardData(
    serviceResult,
    "service",
    selectedInstallation,
  );

  const activeProposal =
    activeProposalMode === "service" ? serviceProposal : investmentProposal;
  const investmentMetrics = getProposalMetrics(investmentProposal);
  const serviceMetrics = getProposalMetrics(serviceProposal);
  const activeMetrics = getProposalMetrics(activeProposal);

  const activeProposalStats =
    activeProposal.id === "investment"
      ? [
          {
            label: "Ahorro anual",
            value: activeMetrics.annualSavings,
          },
          {
            label: "Coste",
            value: activeMetrics.upfrontCost,
          },
          {
            label: "rentabilidad",
            value: activeMetrics.payback,
          },
        ]
      : [
          {
            label: "Ahorro anual",
            value: activeMetrics.annualSavings,
          },
          {
            label: "Cuota mensual",
            value: activeMetrics.monthlyFee,
          },
          {
            label: "Ahorro 25 años",
            value: activeMetrics.totalSavings25Years,
          },
        ];

  const proposalSlides = [investmentProposal, serviceProposal];
  const comparisonRows = [
    {
      label: "Ahorro anual",
      investment: investmentMetrics.annualSavings,
      service: serviceMetrics.annualSavings,
    },
    {
      label: "Ahorro a 25 años",
      investment: investmentMetrics.totalSavings25Years,
      service: serviceMetrics.totalSavings25Years,
    },
    {
      label: "Coste inicial",
      investment: investmentMetrics.upfrontCost,
      service: serviceMetrics.upfrontCost,
    },
    {
      label: "Cuota mensual",
      investment: investmentMetrics.monthlyFee,
      service: serviceMetrics.monthlyFee,
    },
    {
      label: "Payback",
      investment: investmentMetrics.payback,
      service: serviceMetrics.payback,
    },
  ];

  const activeSlideIndex = activeProposalMode === "investment" ? 0 : 1;

  const goToProposal = (mode: "investment" | "service") => {
    setSelectedProposalView(mode);
  };

  const goNextProposal = () => {
    setSelectedProposalView(
      activeProposalMode === "investment" ? "service" : "investment",
    );
  };

  const goPrevProposal = () => {
    setSelectedProposalView(
      activeProposalMode === "service" ? "investment" : "service",
    );
  };
  const [installations, setInstallations] = useState<ApiInstallation[]>([]);

  const [isLoadingInstallations, setIsLoadingInstallations] = useState(false);
  const [uploadedInvoiceFile, setUploadedInvoiceFile] = useState<File | null>(
    null,
  );
  const [savedStudy, setSavedStudy] = useState<any | null>(null);
  const studyPersistLock = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ValidationBillDataFormInput, unknown, ValidationBillData>({
    resolver: zodResolver(ValidationBillDataSchema),
    defaultValues: {
      billType: "2TD",
    },
  });

  const handleRoundUpBlur = (
    fieldName: keyof ValidationBillDataFormInput,
    decimals: number,
  ) => {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      const rounded = normalizeAndRoundUp(e.target.value, decimals);

      if (rounded === undefined) return;

      setValue(fieldName, rounded as any, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    };
  };

  const watchedBillType = watch("billType");
  const watchedAverageMonthlyConsumption = watch(
    "averageMonthlyConsumptionKwh",
  );
  // useEffect(() => {
  //   if (currentStep === "map") {
  //     void fetchInstallations();
  //   }
  // }, [currentStep, rawExtraction]);

  useEffect(() => {
    const parsed = parseFormNumber(watchedAverageMonthlyConsumption);
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      setValue("monthlyConsumption", parsed, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
  }, [watchedAverageMonthlyConsumption, setValue]);

  const handleDownloadPDF = async () => {
    if (!activeCalculationResult || !extractedData) return;

    sileo.promise(
      (async () => {
        const billData = toBaseBillData(extractedData);
        const pdfArtifact = await buildPdfArtifact(
          billData,
          activeCalculationResult,
          buildProposalPdfSummary(activeProposal),
        );

        savePdfArtifactLocally(
          pdfArtifact,
          `Estudio_Solar_${activeProposal.id}_${billData.name || "cliente"}.pdf`,
        );
      })(),
      {
        loading: { title: "Generando tu estudio en PDF..." },
        success: { title: "PDF generado y descargado con éxito" },
        error: { title: "No se pudo generar el PDF" },
      },
    );
  };

  const persistStudyAutomatically = async (
    validatedData: ValidationBillData,
    result: CalculationResult,
    installation: ApiInstallation,
  ) => {
    console.log("[front] persistStudyAutomatically START");

    if (!uploadedInvoiceFile) {
      throw new Error(
        "No se encuentra la factura original subida por el cliente",
      );
    }

    console.log("[front] uploadedInvoiceFile:", uploadedInvoiceFile);
    console.log("[front] validatedData.email:", validatedData.email);
    console.log("[front] installation.id:", installation.id);

    const billData = toBaseBillData(validatedData);
    console.log("[front] billData:", billData);

    const proposalForPdf = buildProposalPdfSummary(
      buildProposalCardData(result, "investment", installation),
    );

    const pdfArtifact = await buildPdfArtifact(
      billData,
      result,
      proposalForPdf,
    );
    console.log("[front] pdfArtifact generado:", pdfArtifact);

    const proposalBlob = pdfArtifactToBlob(pdfArtifact);
    console.log("[front] proposalBlob:", proposalBlob);

    const proposalFile = new File(
      [proposalBlob],
      `Estudio_Solar_${validatedData.name || "cliente"}.pdf`,
      { type: "application/pdf" },
    );

    console.log("[front] proposalFile:", proposalFile);
    console.log("[front] proposalFile.size:", proposalFile.size);
    console.log("[front] proposalFile.type:", proposalFile.type);

    const extractedLocation = (rawExtraction?.location ?? {}) as Record<
      string,
      any
    >;

    const customerPayload = {
      nombre: validatedData.name,
      apellidos: validatedData.lastName,
      dni: validatedData.dni,
      cups: validatedData.cups,
      direccion_completa: validatedData.address,
      email: validatedData.email,
      telefono: validatedData.phone,
      phone: validatedData.phone,
      iban: validatedData.iban,
      codigo_postal:
        extractedLocation.codigo_postal ??
        extractedLocation.codigoPostal ??
        extractedLocation.postalCode ??
        null,
      poblacion:
        extractedLocation.poblacion ??
        extractedLocation.ciudad ??
        extractedLocation.localidad ??
        extractedLocation.city ??
        null,
      provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
      pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
      tipo_factura: validatedData.billType,
      consumo_mensual_real_kwh: validatedData.currentInvoiceConsumptionKwh,
      consumo_medio_mensual_kwh: validatedData.averageMonthlyConsumptionKwh,
      precio_p1_eur_kwh: validatedData.periodPriceP1 ?? null,
      precio_p2_eur_kwh: validatedData.periodPriceP2 ?? null,
      precio_p3_eur_kwh: validatedData.periodPriceP3 ?? null,
      precio_p4_eur_kwh: validatedData.periodPriceP4 ?? null,
      precio_p5_eur_kwh: validatedData.periodPriceP5 ?? null,
      precio_p6_eur_kwh: validatedData.periodPriceP6 ?? null,
    };

    const invoiceDataPayload = {
      ...(rawExtraction?.invoice_data ?? {}),
      type: validatedData.billType,
      currentInvoiceConsumptionKwh: validatedData.currentInvoiceConsumptionKwh,
      averageMonthlyConsumptionKwh: validatedData.averageMonthlyConsumptionKwh,
      consumptionKwh: validatedData.currentInvoiceConsumptionKwh,
      periods: {
        P1: validatedData.periodConsumptionP1 ?? null,
        P2: validatedData.periodConsumptionP2 ?? null,
        P3: validatedData.periodConsumptionP3 ?? null,
        P4: validatedData.periodConsumptionP4 ?? null,
        P5: validatedData.periodConsumptionP5 ?? null,
        P6: validatedData.periodConsumptionP6 ?? null,
      },
      periodPricesEurPerKwh: {
        P1: validatedData.periodPriceP1 ?? null,
        P2: validatedData.periodPriceP2 ?? null,
        P3: validatedData.periodPriceP3 ?? null,
        P4: validatedData.periodPriceP4 ?? null,
        P5: validatedData.periodPriceP5 ?? null,
        P6: validatedData.periodPriceP6 ?? null,
      },
    };

    const locationPayload = {
      ...extractedLocation,
      address: validatedData.address,
      direccion_completa: validatedData.address,
      codigo_postal:
        extractedLocation.codigo_postal ??
        extractedLocation.codigoPostal ??
        extractedLocation.postalCode ??
        null,
      poblacion:
        extractedLocation.poblacion ??
        extractedLocation.ciudad ??
        extractedLocation.localidad ??
        extractedLocation.city ??
        null,
      provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
      pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
      lat: clientCoordinates?.lat ?? null,
      lng: clientCoordinates?.lng ?? null,
    };

    console.log("[front] customerPayload:", customerPayload);
    console.log("[front] locationPayload:", locationPayload);
    console.log("[front] invoiceDataPayload:", invoiceDataPayload);

    console.log("[front] ANTES de confirmStudy");

    const response = await confirmStudy({
      invoiceFile: uploadedInvoiceFile,
      proposalFile,
      customer: customerPayload,
      location: locationPayload,
      invoiceData: invoiceDataPayload,
      calculation: result,
      selectedInstallationId: installation.id,
      selectedInstallationSnapshot: installation,
      language: "ES",
      consentAccepted: privacyAccepted,
    });

    console.log("[front] RESPUESTA confirmStudy:", response);

    setSavedStudy(response);

    if (response?.email?.status === "sent") {
      sileo.success({
        title: "Propuesta enviada por email",
        description: `Se ha enviado correctamente a ${response.email.to ?? "el cliente"}.`,
      });
    } else if (response?.email?.status === "failed") {
      sileo.error({
        title: "La propuesta se guardó, pero el email falló",
        description:
          response?.email?.error ?? "No se pudo enviar el correo al cliente.",
      });
    }

    return response;
  };
  const handleSendEmail = async () => {
    if (!savedStudy) {
      sileo.info({
        title: "Primero genera la propuesta",
        description:
          "El envío por email se realiza automáticamente al guardar el estudio.",
      });
      return;
    }

    const emailInfo = savedStudy?.email;

    if (emailInfo?.status === "sent") {
      sileo.success({
        title: "Correo ya enviado",
        description: `La propuesta se envió correctamente a ${emailInfo.to ?? "el cliente"}.`,
      });
      return;
    }

    if (emailInfo?.status === "failed") {
      sileo.error({
        title: "El envío automático falló",
        description:
          emailInfo?.error ??
          "La propuesta se guardó, pero no se pudo enviar el correo.",
      });
      return;
    }

    sileo.info({
      title: "Procesando envío",
      description:
        "El correo se envía automáticamente al confirmar y guardar el estudio.",
    });
  };

  //   if (!calculationResult || !extractedData?.email) {
  //     sileo.error({
  //       title: "Falta el email del cliente",
  //       description: "Añade un correo válido antes de enviarlo.",
  //     });
  //     return;
  //   }

  //   sileo.promise(
  //     (async () => {
  //       const billData = toBaseBillData(extractedData);
  //       const pdfArtifact = await buildPdfArtifact(billData, calculationResult);

  //       // Verificar que el PDF se ha generado
  //       console.log("PDF generado:", pdfArtifact);

  //       let pdfBlob: Blob | undefined;

  //       // Si pdfArtifact es un ArrayBuffer o Uint8Array, lo convertimos a un Blob
  //       if (
  //         pdfArtifact instanceof ArrayBuffer ||
  //         pdfArtifact instanceof Uint8Array
  //       ) {
  //         pdfBlob = new Blob([pdfArtifact as ArrayBuffer], {
  //           type: "application/pdf",
  //         });
  //       } else if (pdfArtifact instanceof Blob) {
  //         pdfBlob = pdfArtifact;
  //       } else if (pdfArtifact && typeof pdfArtifact.output === "function") {
  //         const pdfAsBlob = pdfArtifact.output("blob");

  //         // Verificamos si la salida es un Blob, de lo contrario, lo convertimos
  //         if (pdfAsBlob instanceof Blob) {
  //           pdfBlob = pdfAsBlob;
  //         } else {
  //           pdfBlob = new Blob([pdfAsBlob as ArrayBuffer], {
  //             type: "application/pdf",
  //           });
  //         }
  //       }

  //       console.log("PDF convertido a Blob:", pdfBlob);

  //       if (!pdfBlob) {
  //         sileo.error({
  //           title: "Error al generar el PDF",
  //           description: "No se pudo generar el PDF correctamente.",
  //         });
  //         return;
  //       }

  //       // Aquí guardamos el archivo PDF localmente
  //       savePdfArtifactLocally(
  //         pdfBlob,
  //         `Estudio_Solar_${billData.name || "cliente"}.pdf`,
  //       );
  //       function pdfArtifactToBlob(pdfArtifact: PdfArtifact): Blob {
  //         if (!pdfArtifact) {
  //           throw new Error("No se pudo generar el PDF");
  //         }

  //         if (isBlob(pdfArtifact)) {
  //           return pdfArtifact;
  //         }

  //         if (isUint8Array(pdfArtifact)) {
  //           const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
  //           return new Blob([buffer], { type: "application/pdf" });
  //         }

  //         if (isArrayBuffer(pdfArtifact)) {
  //           return new Blob([pdfArtifact], { type: "application/pdf" });
  //         }

  //         if (
  //           hasSaveMethod(pdfArtifact) &&
  //           typeof pdfArtifact.output === "function"
  //         ) {
  //           const output = pdfArtifact.output("blob");

  //           if (output instanceof Blob) {
  //             return output;
  //           }

  //           if (output instanceof Uint8Array) {
  //             const buffer = uint8ArrayToArrayBuffer(output);
  //             return new Blob([buffer], { type: "application/pdf" });
  //           }

  //           if (output instanceof ArrayBuffer) {
  //             return new Blob([output], { type: "application/pdf" });
  //           }
  //         }

  //         throw new Error("Formato de PDF no soportado");
  //       }

  //       // Convertir el PDF Blob a Base64
  //       const pdfBase64 = await blobToBase64DataUrl(pdfBlob);
  //       console.log("PDF convertido a Base64:", pdfBase64);

  //       // Ahora pasamos este Blob al servicio de envío de email
  //       await sendStudyEmailWithFallback({
  //         to: extractedData.email,
  //         customerName: extractedData.name || "Cliente",
  //         billData,
  //         calculationResult,
  //         pdfArtifact: pdfBlob, // Aquí le pasamos el archivo PDF como un Blob
  //       });
  //     })(),
  //     {
  //       loading: { title: "Enviando estudio por email..." },
  //       success: { title: "Estudio enviado por email con éxito" },
  //       error: { title: "No se pudo enviar el email" },
  //     },
  //   );
  // };
  // function blobToBase64DataUrl(blob: Blob): Promise<string> {
  //   return new Promise((resolve, reject) => {
  //     const reader = new FileReader();
  //     reader.onloadend = () => {
  //       const result = reader.result;
  //       if (typeof result === "string") {
  //         resolve(result); // Devuelve la cadena Base64
  //       } else {
  //         reject(new Error("No se pudo convertir el PDF a Base64"));
  //       }
  //     };

  //     reader.onerror = () => reject(new Error("Error leyendo el PDF"));
  //     reader.readAsDataURL(blob); // Convierte el Blob en Base64
  //   });
  // }
  const handleFileSelect = async (file: File) => {
    if (!privacyAccepted) {
      sileo.warning({
        title: "Debes aceptar la política de privacidad",
        description:
          "Para subir la factura y continuar, debes aceptar el tratamiento de datos.",
      });
      return;
    }

    setUploadedInvoiceFile(file);

    sileo.promise(
      (async () => {
        const extraction = await extractBillFromApi(file);
        const mappedData = mapExtractedToBillData(extraction);

        setRawExtraction(extraction);
        setExtractedData(mappedData);

        if (mappedData.name) setValue("name", mappedData.name);
        if (mappedData.lastName) setValue("lastName", mappedData.lastName);
        if (mappedData.dni) setValue("dni", mappedData.dni);
        if (mappedData.cups) setValue("cups", mappedData.cups);
        if (mappedData.address) setValue("address", mappedData.address);
        if (mappedData.email) setValue("email", mappedData.email);
        if (mappedData.phone) setValue("phone", mappedData.phone);
        if (mappedData.iban) setValue("iban", mappedData.iban);

        if (typeof mappedData.monthlyConsumption === "number") {
          setValue("monthlyConsumption", mappedData.monthlyConsumption);
        }

        if (mappedData.billType) {
          setValue("billType", mappedData.billType);
        }

        if (typeof mappedData.currentInvoiceConsumptionKwh === "number") {
          setValue(
            "currentInvoiceConsumptionKwh",
            mappedData.currentInvoiceConsumptionKwh,
          );
        }

        if (typeof mappedData.averageMonthlyConsumptionKwh === "number") {
          setValue(
            "averageMonthlyConsumptionKwh",
            mappedData.averageMonthlyConsumptionKwh,
          );
        }

        if (typeof mappedData.periodConsumptionP1 === "number") {
          setValue("periodConsumptionP1", mappedData.periodConsumptionP1);
        }
        if (typeof mappedData.periodConsumptionP2 === "number") {
          setValue("periodConsumptionP2", mappedData.periodConsumptionP2);
        }
        if (typeof mappedData.periodConsumptionP3 === "number") {
          setValue("periodConsumptionP3", mappedData.periodConsumptionP3);
        }
        if (typeof mappedData.periodConsumptionP4 === "number") {
          setValue("periodConsumptionP4", mappedData.periodConsumptionP4);
        }
        if (typeof mappedData.periodConsumptionP5 === "number") {
          setValue("periodConsumptionP5", mappedData.periodConsumptionP5);
        }
        if (typeof mappedData.periodConsumptionP6 === "number") {
          setValue("periodConsumptionP6", mappedData.periodConsumptionP6);
        }

        if (typeof mappedData.periodPriceP1 === "number") {
          setValue("periodPriceP1", mappedData.periodPriceP1);
        }
        if (typeof mappedData.periodPriceP2 === "number") {
          setValue("periodPriceP2", mappedData.periodPriceP2);
        }
        if (typeof mappedData.periodPriceP3 === "number") {
          setValue("periodPriceP3", mappedData.periodPriceP3);
        }
        if (typeof mappedData.periodPriceP4 === "number") {
          setValue("periodPriceP4", mappedData.periodPriceP4);
        }
        if (typeof mappedData.periodPriceP5 === "number") {
          setValue("periodPriceP5", mappedData.periodPriceP5);
        }
        if (typeof mappedData.periodPriceP6 === "number") {
          setValue("periodPriceP6", mappedData.periodPriceP6);
        }

        setCurrentStep("validation");
        showExtractionToasts(extraction);

        return extraction;
      })(),
      {
        loading: { title: "Procesando factura..." },
        success: { title: "Factura procesada con éxito" },
        error: { title: "No se pudo extraer la información de la factura" },
      },
    );
  };

  const onValidationSubmit = (data: ValidationBillData) => {
    sileo.promise(
      (async () => {
        const normalizedData: ValidationBillData = {
          ...data,
          monthlyConsumption:
            data.averageMonthlyConsumptionKwh ?? data.monthlyConsumption,
        };

        setExtractedData(normalizedData);
        setProposalResults(null);
        setSelectedProposalView("investment");
        setSelectedInstallation(null);

        const coords = await geocodeAddress(normalizedData.address);

        if (!coords) {
          setClientCoordinates(null);
          setInstallations([]);
          setCurrentStep("map");

          sileo.error({
            title: "No se pudo localizar la dirección",
            description:
              "No hemos podido obtener las coordenadas de la dirección indicada.",
          });

          return;
        }

        setClientCoordinates(coords);
        setCurrentStep("map");
        await fetchInstallations(coords);

        sileo.success({ title: "Datos validados correctamente" });
      })(),
      {
        loading: { title: "Validando dirección y buscando instalaciones..." },
        success: { title: "Datos validados correctamente" },
        error: { title: "No se pudo validar la ubicación del cliente" },
      },
    );
  };

  const fetchInstallations = async (
    coordsParam?: { lat: number; lng: number } | null,
  ) => {
    const coords = coordsParam ?? clientCoordinates;

    if (!coords) {
      setInstallations([]);
      sileo.error({
        title: "Ubicación no disponible",
        description:
          "No se ha podido obtener la latitud y longitud del cliente.",
      });
      return;
    }

    setIsLoadingInstallations(true);

    try {
      const response = await axios.get<
        ApiInstallation[] | { data: ApiInstallation[] }
      >("/api/installations", {
        params: {
          lat: coords.lat,
          lng: coords.lng,
          radius: 2000,
        },
      });

      const responseData = response.data;
      const parsedInstallations = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

      setInstallations(
        parsedInstallations.filter((item) => item.active !== false),
      );
    } catch (error) {
      console.error("Error fetching installations:", error);
      sileo.error({
        title: "Error al cargar instalaciones",
        description: "Inténtalo de nuevo más tarde",
      });
      setInstallations([]);
    } finally {
      setIsLoadingInstallations(false);
    }
  };
  const handleInstallationSelect = (inst: ApiInstallation) => {
    setSelectedInstallation(inst);
    setCurrentStep("calculation");
  };

  useEffect(() => {
    if (currentStep !== "calculation") return;
    if (!extractedData || !selectedInstallation) return;

    const timer = window.setTimeout(() => {
      const validatedData = extractedData as ValidationBillData;

      const result = calculateEnergyStudy({
        monthlyConsumptionKwh:
          validatedData.averageMonthlyConsumptionKwh ??
          validatedData.monthlyConsumption ??
          0,
        billType:
          (validatedData.billType as BillData["billType"] | undefined) || "2TD",
        effectiveHours: selectedInstallation.horas_efectivas,
        investmentCostKwh: selectedInstallation.coste_kwh_inversion,
        serviceCostKwh: selectedInstallation.coste_kwh_servicio,
        selfConsumptionRatio: normalizeSelfConsumption(
          selectedInstallation.porcentaje_autoconsumo,
        ),
      });

      setProposalResults({
        investment: result,
        service: result,
      });
      setSelectedProposalView("investment");
      setCurrentStep("result");
      sileo.success({ title: "Estudio generado con éxito" });
      console.log("[front] entrando en persistencia automática");
      void (async () => {
        if (studyPersistLock.current) return;
        studyPersistLock.current = true;

        try {
          console.log("[front] llamando a persistStudyAutomatically...");
          await persistStudyAutomatically(
            validatedData,
            result,
            selectedInstallation,
          );

          sileo.success({
            title: "Propuesta guardada automáticamente",
            description: "Cliente, factura, propuesta y estudio registrados.",
          });
        } catch (error: any) {
          console.error("Error guardando estudio confirmado:", error);
          console.error("error.message:", error?.message);
          console.error("error.response?.data:", error?.response?.data);
          console.error("error.response?.status:", error?.response?.status);

          sileo.error({
            title: "El estudio se generó, pero no se pudo guardar",
            description:
              error?.response?.data?.details ||
              error?.message ||
              "Revisa la configuración del servidor.",
          });
        } finally {
          studyPersistLock.current = false;
        }
      })();
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [currentStep, extractedData, selectedInstallation]);

  return (
    <Layout>
      <div className="fixed bottom-8 right-8 z-[100]">
        <Button
          variant="ghost"
          size="sm"
          className="glass-card rounded-full px-6 py-3 font-bold text-brand-navy/60 hover:text-brand-navy border-brand-navy/5 shadow-xl"
          onClick={() => setView(view === "public" ? "admin" : "public")}
        >
          {view === "public" ? "Acceso Admin" : "Volver a la Web"}
        </Button>
      </div>

      <div className="max-w-7xl mx-auto">
        {view === "admin" ? (
          !isAdminLoggedIn ? (
            <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
          ) : (
            <AdminDashboard />
          )
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="mb-12 md:mb-20 relative px-4">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-brand-navy/5 -translate-y-1/2 rounded-full" />
              <div className="relative flex justify-between items-center">
                {[
                  { label: "Subida", icon: Upload },
                  { label: "Validación", icon: FileText },
                  { label: "Ubicación", icon: MapPin },
                  { label: "Resultado", icon: Zap },
                ].map((step, i) => {
                  const steps = [
                    "upload",
                    "validation",
                    "map",
                    "result",
                  ] as const;
                  const currentVisualStep =
                    currentStep === "calculation" ? "map" : currentStep;
                  const currentIndex = steps.indexOf(currentVisualStep);
                  const isActive = i <= currentIndex;
                  const isCurrent = i === currentIndex;

                  return (
                    <div
                      key={step.label}
                      className="flex flex-col items-center gap-3 md:gap-4 relative z-10"
                    >
                      <div
                        className={cn(
                          "w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all duration-700 shadow-lg",
                          isActive
                            ? "brand-gradient text-brand-navy scale-110 shadow-brand-mint/20"
                            : "bg-white border-2 border-brand-navy/5 text-brand-navy/20",
                        )}
                      >
                        {isActive && i < currentIndex ? (
                          <Check className="w-5 h-5 md:w-7 md:h-7" />
                        ) : (
                          <step.icon className="w-5 h-5 md:w-7 md:h-7" />
                        )}
                      </div>

                      <span
                        className={cn(
                          "text-[8px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-bold transition-colors duration-500",
                          isActive ? "text-brand-navy" : "text-brand-navy/20",
                          !isCurrent && "hidden md:block",
                        )}
                      >
                        {step.label}
                      </span>

                      {isCurrent && (
                        <motion.div
                          layoutId="stepper-glow"
                          className="absolute -inset-3 md:-inset-4 brand-gradient opacity-20 blur-xl md:blur-2xl rounded-full -z-10"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {currentStep === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-sky/10 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-6 border border-brand-sky/20">
                    <Sparkles className="w-3 h-3 text-brand-sky" />
                    Estudio Gratuito en 2 Minutos
                  </div>

                  <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
                    Tu futuro energético <br />
                    <span className="brand-gradient-text">empieza aquí</span>
                  </h1>

                  <p className="text-brand-gray text-lg mb-16 max-w-2xl mx-auto leading-relaxed">
                    Sube tu última factura eléctrica y deja que nuestra
                    inteligencia artificial diseñe la solución de ahorro
                    perfecta para tu hogar.
                  </p>

                  <div className="max-w-2xl mx-auto mb-8 text-left">
                    <label className="flex items-start gap-3 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm">
                      <input
                        type="checkbox"
                        checked={privacyAccepted}
                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 rounded border-brand-navy/20 text-brand-mint focus:ring-brand-mint"
                      />

                      <span className="text-sm text-brand-gray leading-relaxed">
                        He leído y acepto la{" "}
                        <a
                          href="../public/politica-privacidad.html"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-brand-navy underline underline-offset-4 hover:text-brand-mint"
                        >
                          Política de Privacidad
                        </a>{" "}
                        y el tratamiento de mis datos para gestionar la subida
                        de mi factura y la elaboración de mi estudio energético.
                      </span>
                    </label>
                  </div>

                  <FileUploader
                    onFileSelect={handleFileSelect}
                    disabled={!privacyAccepted}
                    disabledMessage="Debes aceptar la política de privacidad y el tratamiento de datos antes de subir la factura."
                  />
                  <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                    {[
                      {
                        icon: ShieldCheck,
                        title: "100% Seguro",
                        desc: "Tus datos están protegidos por encriptación de grado bancario.",
                      },
                      {
                        icon: Zap,
                        title: "Ahorro Real",
                        desc: "Cálculos precisos basados en tu consumo histórico real.",
                      },
                      {
                        icon: Leaf,
                        title: "Sostenible",
                        desc: "Reduce tu huella de carbono con energía local certificada.",
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="p-6 rounded-3xl bg-white border border-brand-navy/5 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center mb-4 text-brand-navy">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-brand-navy mb-2">
                          {item.title}
                        </h3>
                        <p className="text-brand-gray text-xs leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === "validation" && (
                <motion.div
                  key="validation"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="max-w-5xl mx-auto"
                >
                  <div className="mb-12 text-center">
                    <h2 className="text-4xl font-bold mb-4">
                      Verifica tu información
                    </h2>
                    <p className="text-brand-gray">
                      Hemos analizado tu factura. Por favor, confirma que los
                      datos extraídos son correctos.
                    </p>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-10 border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
                    <form
                      onSubmit={handleSubmit(onValidationSubmit)}
                      className="space-y-10"
                    >
                      <FormSection
                        title="Datos del titular"
                        subtitle="Confirma la información personal detectada en la factura."
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <Input
                            label="Nombre"
                            {...register("name")}
                            error={errors.name?.message}
                            placeholder="Ej. Juan"
                          />

                          <Input
                            label="Apellidos"
                            {...register("lastName")}
                            error={errors.lastName?.message}
                            placeholder="Ej. Pérez García"
                          />

                          <Input
                            label="DNI / NIF"
                            {...register("dni")}
                            error={errors.dni?.message}
                            placeholder="12345678X"
                          />

                          <Input
                            label="IBAN"
                            {...register("iban")}
                            error={errors.iban?.message}
                            placeholder="ES12 3456 7890 1234 ****"
                          />

                          <Input
                            label="Email"
                            {...register("email")}
                            error={errors.email?.message}
                            placeholder="tu@email.com"
                          />

                          <Input
                            label="Teléfono"
                            {...register("phone")}
                            error={errors.phone?.message}
                            placeholder="600 000 000"
                          />
                        </div>

                        {rawExtraction?.customer?.ibanNeedsCompletion ? (
                          <div className="rounded-2xl bg-brand-sky/10 border border-brand-sky/20 px-4 py-3 text-sm text-brand-navy">
                            La factura oculta parte del IBAN por seguridad.
                            Complétalo manualmente si faltan dígitos.
                          </div>
                        ) : null}
                      </FormSection>

                      <FormSection
                        title="Datos del suministro"
                        subtitle="Revisa el punto de suministro y la dirección completa."
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <Input
                            label="CUPS"
                            {...register("cups")}
                            error={errors.cups?.message}
                            placeholder="ES00..."
                          />

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-[0.2em] text-brand-navy/50">
                              Tipo de factura
                            </label>
                            <select
                              {...register("billType")}
                              className="w-full rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 text-brand-navy outline-none focus:border-brand-mint"
                            >
                              <option value="">Selecciona una opción</option>
                              <option value="2TD">2TD</option>
                              <option value="3TD">3TD</option>
                            </select>
                            {errors.billType?.message ? (
                              <p className="text-sm text-red-500">
                                {errors.billType.message}
                              </p>
                            ) : null}
                          </div>

                          <Input
                            label="Dirección completa"
                            className="md:col-span-2"
                            {...register("address")}
                            error={errors.address?.message}
                            placeholder="Calle, número, CP, ciudad, provincia"
                          />
                        </div>
                      </FormSection>

                      <FormSection
                        title="Consumos detectados"
                        subtitle="Aquí se muestran tanto el consumo real de esta factura como el consumo medio mensual estimado."
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <Input
                            label="Consumo real de esta factura (kWh)"
                            type="number"
                            step="0.01"
                            {...register("currentInvoiceConsumptionKwh")}
                            onBlur={handleRoundUpBlur(
                              "currentInvoiceConsumptionKwh",
                              2,
                            )}
                            error={errors.currentInvoiceConsumptionKwh?.message}
                            placeholder="Ej. 421"
                          />

                          <Input
                            label="Consumo medio mensual estimado (kWh)"
                            type="number"
                            step="0.01"
                            {...register("averageMonthlyConsumptionKwh")}
                            onBlur={handleRoundUpBlur(
                              "averageMonthlyConsumptionKwh",
                              2,
                            )}
                            error={errors.averageMonthlyConsumptionKwh?.message}
                            placeholder="Ej. 388.83"
                          />
                        </div>
                      </FormSection>

                      <FormSection
                        title="Consumo por periodos (kWh)"
                        subtitle="Confirma los kWh de cada periodo tarifario detectados en la factura."
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <Input
                            label="P1 (kWh)"
                            type="number"
                            step="0.01"
                            {...register("periodConsumptionP1")}
                            onBlur={handleRoundUpBlur("periodConsumptionP1", 2)}
                            error={errors.periodConsumptionP1?.message}
                            placeholder="Ej. 122"
                          />
                          <Input
                            label="P2 (kWh)"
                            type="number"
                            step="0.01"
                            {...register("periodConsumptionP2")}
                            onBlur={handleRoundUpBlur("periodConsumptionP2", 2)}
                            error={errors.periodConsumptionP2?.message}
                            placeholder="Ej. 100"
                          />
                          <Input
                            label="P3 (kWh)"
                            type="number"
                            step="0.01"
                            {...register("periodConsumptionP3")}
                            onBlur={handleRoundUpBlur("periodConsumptionP3", 2)}
                            error={errors.periodConsumptionP3?.message}
                            placeholder="Ej. 199"
                          />

                          <Input
                            label="P4 (kWh)"
                            type="number"
                            step="0.01"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodConsumptionP4")}
                            onBlur={handleRoundUpBlur("periodConsumptionP4", 2)}
                            error={errors.periodConsumptionP4?.message}
                            placeholder="Solo 3TD"
                          />
                          <Input
                            label="P5 (kWh)"
                            type="number"
                            step="0.01"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodConsumptionP5")}
                            onBlur={handleRoundUpBlur("periodConsumptionP5", 2)}
                            error={errors.periodConsumptionP5?.message}
                            placeholder="Solo 3TD"
                          />
                          <Input
                            label="P6 (kWh)"
                            type="number"
                            step="0.01"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodConsumptionP6")}
                            onBlur={handleRoundUpBlur("periodConsumptionP6", 2)}
                            error={errors.periodConsumptionP6?.message}
                            placeholder="Solo 3TD"
                          />
                        </div>
                      </FormSection>

                      <FormSection
                        title="Precio por periodos (€/kWh)"
                        subtitle="Si la factura no muestra estos importes explícitamente, pueden venir vacíos y podrás completarlos manualmente."
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <Input
                            label="P1 (€/kWh)"
                            type="number"
                            step="0.00001"
                            {...register("periodPriceP1")}
                            error={errors.periodPriceP1?.message}
                            placeholder="Ej. 0.18508"
                          />
                          <Input
                            label="P2 (€/kWh)"
                            type="number"
                            step="0.00001"
                            {...register("periodPriceP2")}
                            error={errors.periodPriceP2?.message}
                            placeholder="Ej. 0.17790"
                          />
                          <Input
                            label="P3 (€/kWh)"
                            type="number"
                            step="0.00001"
                            {...register("periodPriceP3")}
                            error={errors.periodPriceP3?.message}
                            placeholder="Ej. 0.15000"
                          />

                          <Input
                            label="P4 (€/kWh)"
                            type="number"
                            step="0.00001"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodPriceP4")}
                            error={errors.periodPriceP4?.message}
                            placeholder="Solo 3TD"
                          />
                          <Input
                            label="P5 (€/kWh)"
                            type="number"
                            step="0.00001"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodPriceP5")}
                            error={errors.periodPriceP5?.message}
                            placeholder="Solo 3TD"
                          />
                          <Input
                            label="P6 (€/kWh)"
                            type="number"
                            step="0.00001"
                            disabled={watchedBillType !== "3TD"}
                            {...register("periodPriceP6")}
                            error={errors.periodPriceP6?.message}
                            placeholder="Solo 3TD"
                          />
                        </div>
                      </FormSection>

                      <div className="flex justify-center pt-4">
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full md:w-auto px-12 py-7 text-lg rounded-2xl"
                        >
                          Confirmar y Continuar
                          <ArrowRight className="ml-3 w-5 h-5" />
                        </Button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}

              {currentStep === "map" && (
                <motion.div
                  key="map"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                >
                  <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold mb-4">
                      Selecciona tu comunidad
                    </h2>
                    <p className="text-brand-gray">
                      Estas son las instalaciones activas disponibles dentro del
                      radio legal de 2 km de tu ubicación.
                    </p>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-10 h-[700px]">
                    <div className="flex-1 bg-white rounded-[3rem] overflow-hidden relative border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
                      {clientCoords ? (
                        <MapContainer
                          center={[clientCoords.lat, clientCoords.lng]}
                          zoom={13}
                          scrollWheelZoom={true}
                          className="h-full w-full z-0"
                        >
                          <TileLayer
                            attribution="&copy; OpenStreetMap contributors"
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />

                          <Marker
                            position={[clientCoords.lat, clientCoords.lng]}
                          >
                            <Popup>Ubicación del cliente</Popup>
                          </Marker>

                          <Circle
                            center={[clientCoords.lat, clientCoords.lng]}
                            radius={2000}
                            pathOptions={{
                              color: "#57d9d3",
                              fillColor: "#57d9d3",
                              fillOpacity: 0.12,
                            }}
                          />

                          {installations.map((inst) => (
                            <Marker
                              key={inst.id}
                              position={[Number(inst.lat), Number(inst.lng)]}
                            >
                              <Popup>
                                <div className="text-sm">
                                  <p className="font-bold">
                                    {inst.nombre_instalacion}
                                  </p>
                                  <p>{inst.direccion}</p>
                                  <p className="mt-1">
                                    Distancia: {inst.distance_meters ?? "-"} m
                                  </p>
                                </div>
                              </Popup>
                            </Marker>
                          ))}
                        </MapContainer>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/[0.02] text-brand-navy/40 font-bold">
                          No se ha podido cargar el mapa porque faltan
                          coordenadas.
                        </div>
                      )}

                      <div className="absolute bottom-8 left-8 right-8 glass-card p-6 rounded-3xl flex items-center justify-between z-[400]">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white">
                            <MapPin className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              Tu Ubicación
                            </p>
                            <p className="font-bold text-brand-navy">
                              {extractedData?.address ||
                                "Cargando dirección..."}
                            </p>
                          </div>
                        </div>

                        <div className="hidden md:block px-4 py-2 bg-brand-mint/20 text-brand-navy text-[10px] font-bold rounded-full uppercase tracking-widest">
                          {installations.length} Instalaciones Disponibles
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-96 flex flex-col gap-6 overflow-y-auto pr-4 custom-scrollbar">
                      <h3 className="font-bold text-xl text-brand-navy flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-mint" />
                        Plantas Recomendadas
                      </h3>

                      {isLoadingInstallations ? (
                        <div className="flex flex-col items-center justify-center py-12 text-brand-navy/40">
                          <Loader2 className="w-8 h-8 animate-spin mb-4" />
                          <p className="text-sm font-bold uppercase tracking-widest">
                            Buscando plantas...
                          </p>
                        </div>
                      ) : installations.length === 0 ? (
                        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-6 text-left">
                          <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
                            No hay instalaciones disponibles
                          </p>

                          <p className="text-sm text-amber-700/80 mt-3 leading-relaxed">
                            No hemos encontrado instalaciones activas dentro de
                            un radio de 2 km para esta dirección. Contacta con
                            Sapiens para revisar tu caso.
                          </p>

                          <div className="mt-4 space-y-1 text-sm font-semibold text-brand-navy">
                            <p>Teléfono: 960 000 000</p>
                            <p>Email: info@sapiensenergia.com</p>
                          </div>
                        </div>
                      ) : (
                        installations.map((inst, i) => (
                          <motion.div
                            key={inst.id || i}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            onClick={() => handleInstallationSelect(inst)}
                            className="p-8 rounded-[2rem] border border-brand-navy/5 bg-white hover:border-brand-mint hover:shadow-2xl hover:shadow-brand-mint/10 transition-all cursor-pointer group relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-32 h-32 brand-gradient opacity-0 group-hover:opacity-5 transition-opacity -mr-16 -mt-16 rounded-full" />

                            <div className="flex justify-between items-start gap-4 mb-4">
                              <p className="font-bold text-lg text-brand-navy group-hover:text-brand-mint transition-colors leading-tight">
                                {inst.nombre_instalacion}
                              </p>

                              <span className="text-[10px] font-bold text-brand-mint bg-brand-mint/10 px-2 py-1 rounded-lg uppercase">
                                {inst.modalidad}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-brand-gray flex items-center gap-2 mb-2">
                              <MapPin className="w-3 h-3" />
                              {inst.direccion}
                            </p>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <p className="text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold mb-1">
                                  Potencia
                                </p>
                                <p className="font-bold text-brand-navy">
                                  {formatNumber(inst.potencia_instalada_kwp)}{" "}
                                  kWp
                                </p>
                              </div>

                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <p className="text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold mb-1">
                                  Autoconsumo
                                </p>
                                <p className="font-bold text-brand-navy">
                                  {displayPercentage(
                                    inst.porcentaje_autoconsumo,
                                  )}
                                  %
                                </p>
                              </div>
                            </div>

                            <div className="mt-5 flex items-center gap-3 text-xs text-brand-gray">
                              <Building2 className="w-4 h-4" />
                              <span>
                                {formatNumber(inst.horas_efectivas)} h efectivas
                              </span>
                            </div>

                            <div className="mt-2 flex items-center gap-3 text-xs text-brand-gray">
                              <BatteryCharging className="w-4 h-4" />
                              <span>
                                {formatNumber(inst.almacenamiento_kwh)} kWh
                                almacenamiento
                              </span>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === "calculation" && (
                <motion.div
                  key="calculation"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-32 text-center"
                >
                  <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-2xl shadow-brand-navy/5 flex items-center justify-center mb-12 relative">
                    <Zap className="w-12 h-12 text-brand-navy animate-pulse" />
                    <div className="absolute -inset-4 border-4 border-brand-mint border-t-transparent rounded-[3rem] animate-spin" />
                  </div>

                  <h2 className="text-4xl font-bold mb-6">
                    Generando tu estudio <br />
                    <span className="brand-gradient-text">
                      de alta precisión
                    </span>
                  </h2>

                  <p className="text-brand-gray mb-12 max-w-sm mx-auto">
                    Nuestros algoritmos están procesando miles de variables para
                    ofrecerte el mejor resultado.
                  </p>

                  <div className="space-y-4 max-w-xs w-full">
                    {[
                      "Validando datos de factura",
                      "Analizando radiación solar local",
                      "Calculando retorno de inversión",
                    ].map((text, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.5 }}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-brand-navy/5 shadow-sm"
                      >
                        <div className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-brand-navy" />
                        </div>
                        <span className="text-sm font-bold text-brand-navy/60">
                          {text}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === "result" && proposalResults && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8 md:space-y-12"
                >
                  <div className="brand-gradient rounded-[2rem] md:rounded-[3.5rem] p-5 md:p-12 text-brand-navy shadow-2xl shadow-brand-mint/20 relative overflow-hidden">
                    {" "}
                    <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/10 blur-3xl rounded-full -mr-32 md:-mr-48 -mt-32 md:-mt-48" />
                    <div className="relative z-10 space-y-10">
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-8">
                        <div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-4">
                            <Sparkles className="w-3 h-3" />
                            Estudio Finalizado
                          </div>

                          <h2 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
                            Compara tu modalidad{" "}
                            <br className="hidden md:block" />y elige cómo
                            ahorrar
                          </h2>

                          <p className="text-brand-navy/60 font-medium text-base md:text-lg max-w-2xl">
                            Hemos preparado una comparativa entre inversión y
                            servicio para que puedas ver rápidamente cuál encaja
                            mejor con tu perfil.
                          </p>
                        </div>

                        <div className="bg-white/30 backdrop-blur-xl p-4 md:p-8 rounded-[1.4rem] md:rounded-[2.5rem] border border-white/20 shadow-xl text-center w-full xl:w-auto xl:min-w-[260px]">
                          {" "}
                          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-navy/40 mb-2">
                            Opción seleccionada
                          </p>
                          <p className="text-2xl md:text-4xl font-bold">
                            {" "}
                            {activeProposal.title}
                          </p>
                          <p className="text-sm text-brand-navy/60 mt-3">
                            Ahorro estimado anual
                          </p>
                          <p className="text-xl md:text-2xl font-bold mt-1">
                            {" "}
                            {formatCurrency(activeProposal.annualSavings)}
                          </p>
                        </div>
                      </div>

                      <div className="w-full md:w-auto">
                        <div className="inline-flex w-full md:w-auto rounded-[1.4rem] bg-white/35 p-1.5 backdrop-blur-xl border border-white/30 shadow-lg shadow-brand-navy/5">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedProposalView("investment")
                            }
                            className={cn(
                              "flex-1 md:flex-none px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                              activeProposalMode === "investment"
                                ? "bg-brand-navy text-white shadow-md"
                                : "text-brand-navy/70 hover:text-brand-navy",
                            )}
                          >
                            Inversión
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedProposalView("service")}
                            className={cn(
                              "flex-1 md:flex-none px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                              activeProposalMode === "service"
                                ? "bg-brand-navy text-white shadow-md"
                                : "text-brand-navy/70 hover:text-brand-navy",
                            )}
                          >
                            Servicio
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto pb-2 -mx-1 md:mx-0 md:overflow-visible">
                        <div className="flex gap-3 px-1 md:grid md:grid-cols-4 md:gap-8 md:px-0">
                          {[
                            {
                              label: "Potencia Rec.",
                              value: `${formatNumber(activeProposal.recommendedPowerKwp)} kWp`,
                            },
                            {
                              label: "Consumo Anual",
                              value: `${formatNumber(activeProposal.annualConsumptionKwh)} kWh`,
                            },
                            {
                              label:
                                activeProposalMode === "investment"
                                  ? "Coste 25 años"
                                  : "Coste inicial",
                              value: formatCurrency(activeProposal.upfrontCost),
                            },
                            {
                              label:
                                activeProposalMode === "investment"
                                  ? "Payback"
                                  : "Cuota mensual",
                              value:
                                activeProposalMode === "investment"
                                  ? activeProposal.paybackYears > 0
                                    ? `${formatNumber(activeProposal.paybackYears)} años`
                                    : "-"
                                  : activeProposal.monthlyFee &&
                                      activeProposal.monthlyFee > 0
                                    ? `${formatCurrency(activeProposal.monthlyFee)} / mes`
                                    : "Sin cuota",
                            },
                          ].map((stat, i) => (
                            <div
                              key={i}
                              className="min-w-[145px] rounded-[1.25rem] bg-white/35 backdrop-blur-xl border border-white/25 p-3.5 shadow-md shadow-brand-navy/5 md:min-w-0 md:bg-transparent md:backdrop-blur-0 md:border-0 md:p-0 md:shadow-none"
                            >
                              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-brand-navy/40">
                                {" "}
                                {stat.label}
                              </p>
                              <p className="text-base md:text-2xl font-bold mt-1.5 text-brand-navy leading-tight">
                                {" "}
                                {stat.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
                    {" "}
                    <div className="lg:col-span-2 space-y-8">
                      <div className="bg-white rounded-[3rem] p-6 md:p-8 border border-brand-navy/5 shadow-xl shadow-brand-navy/5">
                        <div className="flex items-start justify-between gap-3 mb-5">
                          {" "}
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-navy/40 mb-2">
                              Modalidad
                            </p>
                            <h3 className="text-2xl font-bold text-brand-navy">
                              {activeProposal.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={goPrevProposal}
                              className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy font-bold transition"
                            >
                              ←
                            </button>

                            <button
                              type="button"
                              onClick={goNextProposal}
                              className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy font-bold transition"
                            >
                              →
                            </button>
                          </div>
                        </div>

                        <div className="hidden md:flex gap-3 mb-6">
                          <button
                            type="button"
                            onClick={() => goToProposal("investment")}
                            className={cn(
                              "px-4 py-2 rounded-2xl text-sm font-bold transition-all border",
                              activeProposalMode === "investment"
                                ? "bg-brand-navy text-white border-brand-navy"
                                : "bg-white text-brand-navy border-brand-navy/10 hover:bg-brand-navy/5",
                            )}
                          >
                            Inversión
                          </button>

                          <button
                            type="button"
                            onClick={() => goToProposal("service")}
                            className={cn(
                              "px-4 py-2 rounded-2xl text-sm font-bold transition-all border",
                              activeProposalMode === "service"
                                ? "bg-brand-navy text-white border-brand-navy"
                                : "bg-white text-brand-navy border-brand-navy/10 hover:bg-brand-navy/5",
                            )}
                          >
                            Servicio
                          </button>
                        </div>

                        <div className="relative overflow-hidden">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={activeProposal.id}
                              initial={{
                                opacity: 0,
                                x:
                                  activeProposalMode === "investment"
                                    ? -40
                                    : 40,
                              }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{
                                opacity: 0,
                                x:
                                  activeProposalMode === "investment"
                                    ? 40
                                    : -40,
                              }}
                              transition={{ duration: 0.28 }}
                              className={cn(
                                "rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-10 border relative overflow-hidden min-h-[unset] md:min-h-[420px]",
                                activeProposal.id === "investment"
                                  ? "bg-brand-navy text-white border-brand-navy shadow-2xl shadow-brand-navy/20"
                                  : "bg-gradient-to-br from-white to-brand-sky/10 text-brand-navy border-brand-navy/5 shadow-lg",
                              )}
                            >
                              <div
                                className={cn(
                                  "absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl",
                                  activeProposal.id === "investment"
                                    ? "bg-brand-mint/20"
                                    : "bg-brand-sky/20",
                                )}
                              />

                              <div className="relative z-10">
                                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                  <div>
                                    <span
                                      className={cn(
                                        "inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4",
                                        activeProposal.id === "investment"
                                          ? "bg-white/10 text-white"
                                          : "bg-brand-mint/10 text-brand-navy",
                                      )}
                                    >
                                      {activeProposal.badge}
                                    </span>

                                    <h3 className="text-3xl md:text-4xl font-bold">
                                      {activeProposal.title}
                                    </h3>

                                    <p
                                      className={cn(
                                        "mt-3 text-sm leading-relaxed max-w-xl",
                                        activeProposal.id === "investment"
                                          ? "text-white/75"
                                          : "text-brand-gray",
                                      )}
                                    >
                                      {activeProposal.description}
                                    </p>
                                  </div>

                                  <div
                                    className={cn(
                                      "rounded-[1.4rem] px-4 py-3 border w-full sm:w-auto sm:min-w-[180px]",
                                      activeProposal.id === "investment"
                                        ? "bg-white/10 border-white/10"
                                        : "bg-white border-brand-navy/5",
                                    )}
                                  >
                                    <p
                                      className={cn(
                                        "text-[10px] uppercase tracking-[0.2em] font-bold mb-2",
                                        activeProposal.id === "investment"
                                          ? "text-white/50"
                                          : "text-brand-navy/40",
                                      )}
                                    >
                                      Ahorro anual
                                    </p>
                                    <p className="text-2xl font-bold">
                                      {formatCurrency(
                                        activeProposal.annualSavings,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="overflow-x-auto pb-1 -mx-1 mb-8 md:mx-0 md:overflow-visible">
                                  <div className="flex gap-3 px-1 md:grid md:grid-cols-3 md:gap-4 md:px-0">
                                    {activeProposalStats.map((stat) => (
                                      <div
                                        key={stat.label}
                                        className={cn(
                                          "min-w-[145px] rounded-[1.2rem] p-3 border md:min-w-0 md:rounded-2xl md:p-4",
                                          activeProposal.id === "investment"
                                            ? "bg-white/10 border-white/10"
                                            : "bg-white border-brand-navy/5",
                                        )}
                                      >
                                        <p
                                          className={cn(
                                            "text-[9px] md:text-[10px] uppercase tracking-[0.14em] md:tracking-widest font-bold mb-1",
                                            activeProposal.id === "investment"
                                              ? "text-white/50"
                                              : "text-brand-navy/40",
                                          )}
                                        >
                                          {stat.label}
                                        </p>
                                        <p className="text-sm md:text-lg font-bold leading-tight">
                                          {stat.value}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
                                  {activeProposal.valuePoints.map((item, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "flex gap-3 rounded-[1.2rem] md:rounded-none p-3 md:p-0",
                                        activeProposal.id === "investment"
                                          ? "bg-white/5 md:bg-transparent"
                                          : "bg-brand-navy/[0.03] md:bg-transparent",
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0",
                                          activeProposal.id === "investment"
                                            ? "bg-white/10"
                                            : "brand-gradient shadow-md shadow-brand-mint/20",
                                        )}
                                      >
                                        <Check
                                          className={cn(
                                            "w-4 h-4 md:w-5 md:h-5",
                                            activeProposal.id === "investment"
                                              ? "text-white"
                                              : "text-brand-navy",
                                          )}
                                        />
                                      </div>

                                      <div>
                                        <h4 className="font-semibold md:font-bold text-sm md:text-base mb-0.5 md:mb-1">
                                          {item}
                                        </h4>

                                        <p
                                          className={cn(
                                            "hidden md:block text-xs leading-relaxed",
                                            activeProposal.id === "investment"
                                              ? "text-white/70"
                                              : "text-brand-gray",
                                          )}
                                        >
                                          {activeProposal.id === "investment"
                                            ? "Pensada para clientes que quieren maximizar el retorno y consolidar el ahorro a largo plazo."
                                            : "Pensada para clientes que quieren una entrada más cómoda y una decisión más flexible."}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        <div className="flex items-center justify-center gap-2 mt-6">
                          {proposalSlides.map((slide, index) => (
                            <button
                              key={slide.id}
                              type="button"
                              onClick={() => goToProposal(slide.id)}
                              className={cn(
                                "h-2.5 rounded-full transition-all",
                                index === activeSlideIndex
                                  ? "w-10 bg-brand-navy"
                                  : "w-2.5 bg-brand-navy/20 hover:bg-brand-navy/40",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-5 md:p-10 border border-brand-navy/5 shadow-xl shadow-brand-navy/5">
                        <h3 className="font-bold text-xl md:text-2xl text-brand-navy mb-6 md:mb-8 flex items-center gap-3">
                          <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-brand-mint" />
                          Comparativa rápida
                        </h3>

                        {/* Mobile */}
                        <div className="md:hidden space-y-3">
                          {comparisonRows.map((row) => (
                            <div
                              key={row.label}
                              className="rounded-[1.25rem] border border-brand-navy/5 bg-gradient-to-b from-white to-brand-sky/5 p-3.5 shadow-sm"
                            >
                              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/35 mb-3">
                                {row.label}
                              </p>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-[1rem] bg-brand-navy text-white p-3">
                                  <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">
                                    Inversión
                                  </p>
                                  <p className="text-[13px] font-semibold leading-snug">
                                    {" "}
                                    {row.investment}
                                  </p>
                                </div>

                                <div className="rounded-[1rem] bg-brand-navy/[0.04] p-3">
                                  <p className="text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold mb-1">
                                    Servicio
                                  </p>
                                  <p className="text-[13px] font-semibold leading-snug">
                                    {" "}
                                    {row.service}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop */}
                        <div className="hidden md:block overflow-hidden rounded-[2rem] border border-brand-navy/5">
                          <div className="grid grid-cols-3 bg-brand-navy/[0.03]">
                            <div className="p-4 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              Concepto
                            </div>
                            <div className="p-4 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              Inversión
                            </div>
                            <div className="p-4 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              Servicio
                            </div>
                          </div>

                          {comparisonRows.map((row, index) => (
                            <div
                              key={row.label}
                              className={cn(
                                "grid grid-cols-3",
                                index % 2 === 0
                                  ? "bg-white"
                                  : "bg-brand-navy/[0.02]",
                              )}
                            >
                              <div className="p-4 text-sm font-bold text-brand-navy">
                                {row.label}
                              </div>
                              <div className="p-4 text-sm text-brand-gray">
                                {row.investment}
                              </div>
                              <div className="p-4 text-sm text-brand-gray">
                                {row.service}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* 
                      <div className="bg-white rounded-[3rem] p-10 border border-brand-navy/5 shadow-xl shadow-brand-navy/5">
                        <h3 className="font-bold text-2xl text-brand-navy mb-8 flex items-center gap-3">
                          <Check className="w-6 h-6 text-brand-mint" />
                          Propuesta activa: {activeProposal.title}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {activeProposal.valuePoints.map((item, i) => (
                            <div key={i} className="flex gap-4">
                              <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shrink-0 shadow-md shadow-brand-mint/20">
                                <Check className="w-5 h-5 text-brand-navy" />
                              </div>
                              <div>
                                <h4 className="font-bold text-brand-navy mb-1">
                                  {item}
                                </h4>
                                <p className="text-xs text-brand-gray leading-relaxed">
                                  {activeProposal.id === "investment"
                                    ? "Pensada para clientes que quieren maximizar el retorno y consolidar su ahorro en el tiempo."
                                    : "Pensada para clientes que prefieren una entrada más cómoda y una decisión de contratación más simple."}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div> */}
                    </div>
                    <div className="space-y-6">
                      <div className="bg-brand-navy rounded-[2rem] md:rounded-[3rem] p-5 md:p-10 text-white shadow-2xl shadow-brand-navy/20 md:sticky md:top-8">
                        {" "}
                        <h3 className="font-bold text-xl mb-3">
                          Próximos Pasos
                        </h3>
                        <p className="text-white/60 text-sm mb-8 leading-relaxed">
                          Las acciones de abajo se generarán usando la modalidad
                          activa:
                          <span className="font-bold text-white">
                            {" "}
                            {activeProposal.title}
                          </span>
                          .
                        </p>
                        <div className="space-y-4">
                          <Button
                            className="w-full py-5 md:py-8 text-base md:text-lg rounded-[1.2rem] md:rounded-2xl brand-gradient text-brand-navy border-none"
                            onClick={handleDownloadPDF}
                          >
                            <Download className="mr-3 w-6 h-6" /> Descargar PDF
                          </Button>

                          <Button
                            className="w-full py-5 md:py-8 text-base md:text-lg rounded-[1.2rem] md:rounded-2xl bg-white/10 hover:bg-white/20 border-white/10 text-white"
                            variant="outline"
                            onClick={handleSendEmail}
                          >
                            <Mail className="mr-3 w-6 h-6" /> Enviar por Email
                          </Button>

                          <Button className="w-full py-5 md:py-8 text-base md:text-lg rounded-[1.2rem] md:rounded-2xl bg-brand-mint text-brand-navy hover:bg-brand-mint/90 border-none font-bold">
                            Hablar con Asesor
                          </Button>
                        </div>
                        <div className="mt-8 rounded-2xl bg-white/10 p-5 border border-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">
                            Resumen activo
                          </p>
                          <p className="text-2xl font-bold">
                            {formatCurrency(activeProposal.annualSavings)} / año
                          </p>
                          <p className="text-sm text-white/60 mt-2">
                            {activeProposal.id === "investment"
                              ? `Coste estimado 25 años ${formatCurrency(activeProposal.upfrontCost)}`
                              : activeProposal.monthlyFee &&
                                  activeProposal.monthlyFee > 0
                                ? `Cuota estimada ${formatCurrency(activeProposal.monthlyFee)} / mes`
                                : "Sin cuota mensual"}
                          </p>
                        </div>
                        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/40 mt-8">
                          Oferta válida por 7 días
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Layout>
  );
}
