import React, { useEffect, useRef, useState } from "react";
import Layout from "./components/shared/Layout";
import FileUploader from "./components/shared/FileUploader";
import Button from "./components/ui/Button";
import Input from "./components/ui/Input";
import AdminLogin from "./components/admin/AdminLogin";
import AdminDashboard from "./components/admin/AdminDashboard";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BillDataSchema, type BillData } from "./lib/validators";
import { motion, AnimatePresence } from "motion/react";
import { extractBillFromApi } from "./services/extractionApiService";
import type { ExtractedBillData } from "./services/geminiService";
import { confirmStudy } from "./services/confirmStudyService";
import { Routes, Route } from "react-router-dom";
import SelectField from "./components/ui/SelectField";
import ContinuarContratacionPage from "./pages/ContinueContraction";

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
import { Icon } from "@iconify/react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
//ASASASS
// import {ContratacionDesdePropuestaPage} from "./pages/ContratacionDesdePropuestaPage"
import ContratacionDesdePropuestaPage from "./pages/ContratacionDesdePropuestaPage";
import ReservationConfirmedPage from "./pages/ReservationConfirmedPage";
import ReservationCancelledPage from "./pages/ReservationCancelledPage";
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});
import { jsPDF } from "jspdf";
import { log } from "console";

import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  precio_excedentes_eur_kwh?: number;
  porcentaje_autoconsumo: number;
  modalidad: "inversion" | "servicio" | "ambas";
  active: boolean;
  created_at?: string;
  updated_at?: string;
  distance_meters?: number;

  contractable_kwp_total?: number;
  contractable_kwp_reserved?: number;
  contractable_kwp_confirmed?: number;

  total_contractable_kwp?: number;
  reserved_kwp?: number;
  confirmed_kwp?: number;
  unavailable_kwp?: number;
  available_kwp?: number;
  occupancy_percent?: number;

  calculo_estudios?: "segun_factura" | "fijo" | string | null;
  potencia_fija_kwp?: number | null;
  reserva?: "segun_potencia" | "fija" | string | null;
  reserva_fija_eur?: number | null;
  iban_aportaciones?: string | null;

  required_kwp?: number;
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
function getFixedInstallationPower(
  installation: ApiInstallation | null | undefined,
): number | null {
  const fixed = Number(installation?.potencia_fija_kwp ?? 0);

  if (!Number.isFinite(fixed)) return null;
  if (fixed === 0) return null;

  return fixed;
}

function resolveEffectiveAssignedKwpForInstallation(
  validatedData: ValidationBillData,
  installation: ApiInstallation,
  rawExtraction: ExtractedBillData | null,
): number {
  const fixedPower = getFixedInstallationPower(installation);

  if (fixedPower !== null) {
    return fixedPower;
  }

  return calculateRequiredKwpForInstallation(
    validatedData,
    installation,
    rawExtraction,
  );
}
function normalizeAndRoundUp(
  value: unknown,
  decimals: number,
): number | undefined {
  const parsed = parseFormNumber(value);

  if (parsed === undefined || Number.isNaN(parsed)) return undefined;

  return roundUpToDecimals(parsed, decimals);
}

type ProposalMode = "investment" | "service";
type StudyComparisonResult = {
  investment: CalculationResult;
  service: CalculationResult;
};

// const requiredNumberField = z.preprocess(
//   (value) => parseFormNumber(value),
//   z
//     .number({
//       error: (issue) =>
//         issue.input === undefined
//           ? "Este campo es obligatorio"
//           : "Debe ser un número válido",
//     })
//     .min(0, { error: "Debe ser un número válido" }),
// );

const optionalNumberField = z.preprocess(
  (value) => parseFormNumber(value),
  z
    .number({
      error: "Debe ser un número válido",
    })
    .min(0, { error: "Debe ser un número válido" })
    .optional(),
);

const INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR = 36;

const ValidationBillDataSchema = BillDataSchema.extend({
  cups: z.string().optional(),
  iban: z.string().optional(),

  monthlyConsumption: optionalNumberField,

  billType: z.enum(BILL_TYPES, {
    error: "Selecciona el tipo de factura",
  }),

  currentInvoiceConsumptionKwh: optionalNumberField,
  averageMonthlyConsumptionKwh: optionalNumberField,

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

  ibanMasked: z.string().optional(),
  contractedPowerText: z.string().optional(),
  contractedPowerKw: optionalNumberField,
  contractedPowerP1: optionalNumberField,
  contractedPowerP2: optionalNumberField,
});

type ValidationBillDataFormInput = z.input<typeof ValidationBillDataSchema>;
type ValidationBillData = z.output<typeof ValidationBillDataSchema>;
type AppLanguage = "es" | "ca" | "val" | "gl";
function normalizeAppLanguage(value?: string): AppLanguage {
  const lang = (value || "es").toLowerCase().trim();

  if (lang.startsWith("ca")) return "ca";
  if (lang.startsWith("val")) return "val";
  if (lang.startsWith("gl")) return "gl";
  return "es";
}
function buildLastName(
  lastname1: string | null | undefined,
  lastname2: string | null | undefined,
): string {
  return [lastname1, lastname2].filter(Boolean).join(" ").trim();
}

function getPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function buildPeriodPricesFromValidatedData(validatedData: ValidationBillData) {
  return {
    P1: validatedData.periodPriceP1,
    P2: validatedData.periodPriceP2,
    P3: validatedData.periodPriceP3,
    P4: validatedData.periodPriceP4,
    P5: validatedData.periodPriceP5,
    P6: validatedData.periodPriceP6,
  };
}

function buildPeriodConsumptionsFromValidatedData(
  validatedData: ValidationBillData,
) {
  return {
    P1: validatedData.periodConsumptionP1,
    P2: validatedData.periodConsumptionP2,
    P3: validatedData.periodConsumptionP3,
    P4: validatedData.periodConsumptionP4,
    P5: validatedData.periodConsumptionP5,
    P6: validatedData.periodConsumptionP6,
  };
}

function getInvoiceVariableEnergyAmountFromExtraction(
  extraction: ExtractedBillData | null,
): number | undefined {
  const invoiceData = extraction?.invoice_data as
    | Record<string, unknown>
    | undefined;

  if (!invoiceData) return undefined;

  const candidateKeys = [
    "invoiceVariableEnergyAmountEur",
    "variableEnergyAmountEur",
    "energyTermAmountEur",
    "variableTermAmountEur",
    "totalVariableEnergyAmountEur",
    "importeEnergiaConsumidaEur",
    "costeEnergiaEur",
    "costOfEnergyEur",
    "energyCostEur",
  ];

  for (const key of candidateKeys) {
    const value = getPositiveFiniteNumber(invoiceData[key]);
    if (value !== undefined) return value;
  }

  return undefined;
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

  const invoiceDataAny = data.invoice_data as any;

  const contractedPowerTextRaw =
    invoiceDataAny?.contractedPowerText ??
    invoiceDataAny?.potenciaContratadaTexto ??
    invoiceDataAny?.potenciasContratadasTexto ??
    invoiceDataAny?.contractedPowersText ??
    null;

  const contractedPowerP1Raw =
    invoiceDataAny?.contractedPowerP1 ??
    invoiceDataAny?.contractedPowerP1Kw ??
    invoiceDataAny?.potenciaContratadaP1 ??
    invoiceDataAny?.potenciaContratadaPuntaLlano ??
    invoiceDataAny?.potenciaContratadaPuntaLlanoKw ??
    invoiceDataAny?.puntaLlanoKw ??
    invoiceDataAny?.peakFlatKw ??
    invoiceDataAny?.contractedPowers?.punta_llano ??
    invoiceDataAny?.contractedPowers?.puntaLlano ??
    invoiceDataAny?.contractedPowers?.P1 ??
    null;

  const contractedPowerP2Raw =
    invoiceDataAny?.contractedPowerP2 ??
    invoiceDataAny?.contractedPowerP2Kw ??
    invoiceDataAny?.potenciaContratadaP2 ??
    invoiceDataAny?.potenciaContratadaValle ??
    invoiceDataAny?.potenciaContratadaValleKw ??
    invoiceDataAny?.valleKw ??
    invoiceDataAny?.valleyKw ??
    invoiceDataAny?.contractedPowers?.valle ??
    invoiceDataAny?.contractedPowers?.P2 ??
    null;

  const contractedPowerKwRaw =
    invoiceDataAny?.contractedPowerKw ??
    invoiceDataAny?.potenciaContratadaKw ??
    (normalizeAndRoundUp(contractedPowerP1Raw, 2) ===
    normalizeAndRoundUp(contractedPowerP2Raw, 2)
      ? normalizeAndRoundUp(contractedPowerP1Raw, 2)
      : null);

  return {
    name: data.customer.name ?? "",
    lastName: fullLastName,
    dni: data.customer.dni ?? "",
    cups: data.customer.cups ?? "",
    address: data.location.address ?? "",
    email: data.customer.email ?? "",
    phone: data.customer.phone ?? "",
    iban: data.customer.iban ?? "",
    ibanMasked: data.customer.iban ?? "",

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

    contractedPowerText:
      contractedPowerTextRaw ??
      (normalizeAndRoundUp(contractedPowerP1Raw, 2) &&
      normalizeAndRoundUp(contractedPowerP2Raw, 2)
        ? `Punta-llano: ${formatNumber(normalizeAndRoundUp(contractedPowerP1Raw, 2) ?? 0, 2)} kW · Valle: ${formatNumber(normalizeAndRoundUp(contractedPowerP2Raw, 2) ?? 0, 2)} kW`
        : undefined),

    contractedPowerKw: normalizeAndRoundUp(contractedPowerKwRaw, 2),
    contractedPowerP1: normalizeAndRoundUp(contractedPowerP1Raw, 2),
    contractedPowerP2: normalizeAndRoundUp(contractedPowerP2Raw, 2),
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

    contractedPowerText: data.contractedPowerText,
    contractedPowerKw: data.contractedPowerKw,
    contractedPowerP1: data.contractedPowerP1,
    contractedPowerP2: data.contractedPowerP2,
    ibanMasked: data.ibanMasked,
  };
}

function shouldHideFromValidation(field: string): boolean {
  const normalized = field.toLowerCase();

  return [
    "iban",
    "cups",
    "currentinvoiceconsumptionkwh",
    "averagemonthlyconsumptionkwh",
    "consumptionkwh",
    "periodconsumption",
    "periodprice",
    "periods",
    "periodpriceseurperkwh",
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
  ].some((token) => normalized.includes(token));
}

function showExtractionToasts(extraction: ExtractedBillData, t: TFunction) {
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

  const visibleWarnings = (extraction.extraction.warnings ?? []).filter(
    (warning) => !shouldHideFromValidation(warning),
  );

  const visibleManualReviewFields = (
    extraction.extraction.manualReviewFields ?? []
  ).filter((field) => !shouldHideFromValidation(field));

  const visibleMissingFields = (
    extraction.extraction.missingFields ?? []
  ).filter((field) => !shouldHideFromValidation(field));

  if (extraction.extraction.fallbackUsed) {
    queueInfo(
      t(
        "toasts.extraction.fallbackTitle",
        "Extracción completada con apoyo del fallback",
      ),
      t(
        "toasts.extraction.fallbackDescription",
        "Revisa los datos detectados antes de continuar.",
      ),
    );
  }

  visibleWarnings.slice(0, 4).forEach((warning, index) => {
    queueInfo(
      t("toasts.extraction.warningTitle", "Aviso {{index}}", {
        index: index + 1,
      }),
      warning,
    );
  });

  if (visibleManualReviewFields.length) {
    const fields = visibleManualReviewFields.slice(0, 4).join(", ");

    queueError(
      t("toasts.extraction.manualReviewTitle", "Campos que requieren revisión"),
      t(
        "toasts.extraction.manualReviewDescription",
        "Comprueba manualmente estos campos: {{fields}}",
        { fields },
      ),
    );
  }

  if (visibleMissingFields.length) {
    queueInfo(
      t("toasts.extraction.missingFieldsTitle", "Campos incompletos"),
      t(
        "toasts.extraction.missingFieldsDescription",
        "Hay {{count}} campos que pueden necesitar revisión manual.",
        { count: visibleMissingFields.length },
      ),
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
  proposals: ProposalPdfSummary[],
  language: AppLanguage,
): Promise<PdfArtifact> => {
  const result = await generateStudyPDF(
    billData,
    calculationResult,
    proposals,
    language,
  );
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
type ContractPreviewData = {
  contractId: string;
  contractNumber: string;
  proposalMode: "investment" | "service";
  assignedKwp: number;
  client: {
    id: string;
    nombre: string;
    apellidos: string;
    dni: string;
    email?: string | null;
    telefono?: string | null;
  };
  installation: {
    id: string;
    nombre_instalacion: string;
    direccion: string;
  };
};

type GeneratedContractResponse = {
  success: boolean;
  contract: {
    id: string;
    status: string;
    proposal_mode: "investment" | "service";
    contract_number: string;
  };
  previewHtml: string;
  preview: ContractPreviewData;
};
type PaymentMethodId = "stripe" | "bank_transfer";

type PaymentMethodOption = {
  id: PaymentMethodId;
  label: string;
};

type SignedContractResponse = {
  success: boolean;
  message: string;
  contract: any;
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    installationName: string;
    reservedKwp: number;
  };
  payment: {
    step: "select_method";
    availableMethods: {
      id: "stripe" | "bank_transfer";
      label: string;
    }[];
  };
  drive: {
    contractsRootFolderUrl: string;
    contractFolderUrl: string;
    contractFileUrl: string;
  };
};

type StripePaymentResponse = {
  success: boolean;
  message: string;
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "stripe";
  };
  stripe: {
    checkoutSessionId: string;
    checkoutUrl: string;
  };
};

type BankTransferPaymentResponse = {
  success: boolean;
  message: string;
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "bank_transfer";
  };
  bankTransfer: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string;
  };
};

// type SignedContractResponse = {
//   success: boolean;
//   message: string;
//   contract: any;
//   reservation: {
//     id: string;
//     reservationStatus: string;
//     paymentStatus: string;
//     paymentDeadlineAt: string;
//     signalAmount: number;
//     currency: string;
//     installationName: string;
//     reservedKwp: number;
//   };
//   stripe: {
//     checkoutSessionId: string;
//     checkoutUrl: string;
//   };
//   drive: {
//     contractsRootFolderUrl: string;
//     contractFolderUrl: string;
//     contractFileUrl: string;
//   };
// };

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
  const investmentCostPerKwh = Number(installation.coste_kwh_inversion ?? 0);

  if (
    !Number.isFinite(recommendedPowerKwp) ||
    recommendedPowerKwp <= 0 ||
    !Number.isFinite(effectiveHours) ||
    effectiveHours <= 0
  ) {
    return 0;
  }

  return investmentCostPerKwh * recommendedPowerKwp * effectiveHours * 25;
}

function getInvestmentRealCostFromFormula(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  const baseInvestmentCost = getInvestmentCostFromFormula(
    installation,
    recommendedPowerKwp,
  );

  if (!Number.isFinite(recommendedPowerKwp) || recommendedPowerKwp <= 0) {
    return 0;
  }

  const maintenance25Years =
    INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR * recommendedPowerKwp * 25;

  return Math.max(baseInvestmentCost - maintenance25Years, 0);
}

function getServiceMonthlyFeeFromResult(
  result: CalculationResult | null,
): number | null {
  if (!result) return null;

  const annualServiceFee = getFirstNumericField(result, [
    "annualServiceFee",
    "serviceCost",
  ]);

  if (!Number.isFinite(annualServiceFee) || annualServiceFee <= 0) {
    return null;
  }

  return annualServiceFee / 12;
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
  t: TFunction,
): ProposalCardData {
const recommendedPowerKwp = getDisplayedRecommendedPowerKwp(
  result,
  installation,
);

  const annualConsumptionKwh = getFirstNumericField(result, [
    "annualConsumptionKwh",
  ]);

  if (mode === "investment") {
    const annualSavings = getFirstNumericField(result, [
      "annualSavingsInvestment",
      "annualSavings",
    ]);

    const annualMaintenance = getFirstNumericField(
      result,
      ["annualMaintenanceCost"],
      recommendedPowerKwp > 0
        ? INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR * recommendedPowerKwp
        : 0,
    );

    const monthlyMaintenance =
      annualMaintenance > 0 ? annualMaintenance / 12 : null;

    const upfrontCost = getInvestmentRealCostFromFormula(
      installation,
      recommendedPowerKwp,
    );

    const totalSavings25Years = getFirstNumericField(
      result,
      [
        "totalSavings25YearsInvestment",
        "annualSavings25YearsInvestment",
        "investmentSavings25Years",
        "totalSavings25Years",
      ],
      annualSavings * 25,
    );

    const paybackYears = annualSavings > 0 ? upfrontCost / annualSavings : 0;

    return {
      id: "investment",
      title: t("result.modes.investment"),
      badge: t("result.proposals.investment.badge"),
      annualSavings,
      totalSavings25Years,
      upfrontCost,
      monthlyFee: null,
      annualMaintenance,
      monthlyMaintenance,
      paybackYears,
      recommendedPowerKwp,
      annualConsumptionKwh,
      description: t("result.proposals.investment.description"),
      valuePoints: [
        t("result.proposals.investment.points.0"),
        t("result.proposals.investment.points.1"),
        t("result.proposals.investment.points.2"),
        t("result.proposals.investment.points.3"),
      ],
    };
  }

  const annualSavings = getFirstNumericField(result, [
    "annualSavingsService",
    "serviceAnnualSavings",
    "annualSavings",
  ]);

  const totalSavings25Years = getFirstNumericField(
    result,
    [
      "totalSavings25YearsService",
      "annualSavings25YearsService",
      "serviceSavings25Years",
      "serviceTotalSavings25Years",
    ],
    annualSavings * 25,
  );

  const monthlyFee = getServiceMonthlyFeeFromResult(result);

  const paybackYears = getFirstNumericField(result, [
    "servicePaybackYears",
    "paybackYearsService",
  ]);

  return {
    id: "service",
    title: t("result.modes.service"),
    badge: t("result.proposals.service.badge"),
    annualSavings,
    totalSavings25Years,
    upfrontCost: 0,
    monthlyFee,
    annualMaintenance: 0,
    monthlyMaintenance: null,
    paybackYears,
    recommendedPowerKwp,
    annualConsumptionKwh,
    description: t("result.proposals.service.description"),
    valuePoints: [
      t("result.proposals.service.points.0"),
      t("result.proposals.service.points.1"),
      t("result.proposals.service.points.2"),
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

function buildProposalPdfSummariesForInstallation(
  result: CalculationResult,
  installation: ApiInstallation | null,
  t: TFunction,
): ProposalPdfSummary[] {
  if (!installation) return [];

  const normalizedModalidad = normalizeInstallationModalidad(
    installation.modalidad,
  );

  const modes = getAvailableProposalModes(normalizedModalidad);

  return modes.map((mode) =>
    buildProposalPdfSummary(
      buildProposalCardData(result, mode, installation, t),
    ),
  );
}

function formatPaybackYears(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(1).replace(".", ",")} años`;
}

const getMonthlySavings = (proposal: ProposalCardData) => {
  return proposal.annualSavings > 0 ? proposal.annualSavings / 12 : 0;
};
function normalizeFeatureList(items: string[], total = 4) {
  const normalized = [...items];

  while (normalized.length < total) {
    normalized.push("");
  }

  return normalized;
}

function buildEconomicChartData(
  investmentProposal: ProposalCardData,
  serviceProposal: ProposalCardData,
) {
  const investmentRecurring = investmentProposal.annualMaintenance || 0;
  const serviceRecurring = (serviceProposal.monthlyFee ?? 0) * 12;

  const investmentNet25 =
    investmentProposal.totalSavings25Years - investmentProposal.upfrontCost;

  const serviceNet25 = serviceProposal.totalSavings25Years;

  return [
    {
      name: "Entrada",
      inversion: Number(investmentProposal.upfrontCost.toFixed(2)),
      servicio: 0,
    },
    {
      name: "Coste anual",
      inversion: Number(investmentRecurring.toFixed(2)),
      servicio: Number(serviceRecurring.toFixed(2)),
    },
    {
      name: "Balance 25 años",
      inversion: Number(investmentNet25.toFixed(2)),
      servicio: Number(serviceNet25.toFixed(2)),
    },
  ];
}

function getAvailableProposalModes(
  modalidad: ApiInstallation["modalidad"] | null | undefined,
): ProposalMode[] {
  if (modalidad === "inversion") return ["investment"];
  if (modalidad === "servicio") return ["service"];
  return ["investment", "service"];
}
function normalizeInstallationModalidad(
  modalidad: string | null | undefined,
): ApiInstallation["modalidad"] {
  const value = (modalidad ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (value === "inversion") return "inversion";
  if (value === "servicio" || value === "service") return "servicio";
  if (value === "ambas") return "ambas";

  return "ambas";
}
function getInstallationModeLabel(
  modalidad: ApiInstallation["modalidad"] | string | null | undefined,
  t: TFunction,
): string {
  const normalized = normalizeInstallationModalidad(modalidad);

  if (normalized === "inversion") {
    return t("map.installationCard.modes.investment", "Inversión");
  }

  if (normalized === "servicio") {
    return t("map.installationCard.modes.service", "Servicio");
  }

  return t("map.installationCard.modes.both", "Ambas");
}

function getDefaultProposalMode(
  modalidad: ApiInstallation["modalidad"] | null | undefined,
): ProposalMode {
  const modes = getAvailableProposalModes(modalidad);
  return modes[0] ?? "investment";
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

function normalizeSelfConsumption(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.7;
  return value > 1 ? value / 100 : value;
}


function getDisplayedRecommendedPowerKwp(
  result: CalculationResult | null,
  installation: ApiInstallation | null,
): number {
  const fixedPower = getFixedInstallationPower(installation);

  if (fixedPower !== null) {
    return fixedPower;
  }

  return getFirstNumericField(result, ["recommendedPowerKwp"], 0);
}

function calculateRequiredKwpForInstallation(
  validatedData: ValidationBillData,
  installation: ApiInstallation,
  rawExtraction: ExtractedBillData | null,
): number {
  const periodPrices = buildPeriodPricesFromValidatedData(validatedData);

  const periodConsumptions =
    buildPeriodConsumptionsFromValidatedData(validatedData);

  const invoiceVariableEnergyAmountEur =
    getInvoiceVariableEnergyAmountFromExtraction(rawExtraction);

  console.log("[calc] periodPrices:", periodPrices);
  console.log("[calc] periodConsumptions:", periodConsumptions);
  console.log(
    "[calc] invoiceVariableEnergyAmountEur:",
    invoiceVariableEnergyAmountEur,
  );

  const result = calculateEnergyStudy({
    monthlyConsumptionKwh:
      validatedData.averageMonthlyConsumptionKwh ??
      validatedData.monthlyConsumption ??
      0,

    invoiceConsumptionKwh:
      validatedData.currentInvoiceConsumptionKwh ??
      validatedData.averageMonthlyConsumptionKwh ??
      validatedData.monthlyConsumption ??
      0,

    billType:
      (validatedData.billType as BillData["billType"] | undefined) || "2TD",

    effectiveHours: installation.horas_efectivas,
    investmentCostKwh: installation.coste_kwh_inversion,
    serviceCostKwh: installation.coste_kwh_servicio,

    selfConsumptionRatio: normalizeSelfConsumption(
      installation.porcentaje_autoconsumo,
    ),

    periodPrices,
    periodConsumptions,
    invoiceVariableEnergyAmountEur,

    surplusCompensationPriceKwh: installation.precio_excedentes_eur_kwh ?? 0,

    maintenanceAnnualPerKwp:
      installation.coste_anual_mantenimiento_por_kwp ??
      INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,

    vatRate: 0.21,
  });

  return getFirstNumericField(result, ["recommendedPowerKwp"], 0);
}

const chartPalette = {
  navy: "#07005f",
  mint: "#57d9d3",
  text: "#7c83a3",
  grid: "rgba(7, 0, 95, 0.08)",
  hover: "rgba(7, 0, 95, 0.04)",
};

function getDateLocale(language: string) {
  if (language === "val") return "ca-ES";
  if (language === "ca") return "ca-ES";
  return "es-ES";
}
function MainAppContent() {
  const { t, i18n } = useTranslation();
  const currentAppLanguage = normalizeAppLanguage(
    i18n.resolvedLanguage || i18n.language,
  );

  const [view, setView] = useState<"public" | "admin">("public");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [extractedData, setExtractedData] =
    useState<Partial<ValidationBillData> | null>(null);
  const [rawExtraction, setRawExtraction] = useState<ExtractedBillData | null>(
    null,
  );
  const [installationAvailabilityError, setInstallationAvailabilityError] =
    useState<"no_installations_in_radius" | "insufficient_capacity" | null>(
      null,
    );
  const [proposalResults, setProposalResults] =
    useState<StudyComparisonResult | null>(null);

  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [selectedProposalView, setSelectedProposalView] =
    useState<ProposalMode>("investment");

  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContractResponse | null>(null);

  const [signedContractResult, setSignedContractResult] =
    useState<SignedContractResponse | null>(null);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] =
    useState(false);
  const [isSelectingPaymentMethod, setIsSelectingPaymentMethod] =
    useState(false);

  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [signatureHasContent, setSignatureHasContent] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

  // const investmentResult = proposalResults?.investment ?? null;
  // const serviceResult =
  //   proposalResults?.service ?? proposalResults?.investment ?? null;

  // const activeProposalMode: "investment" | "service" =
  //   selectedProposalView === "service" ? "service" : "investment";
  // const [selectedInstallation, setSelectedInstallation] =
  //   useState<ApiInstallation | null>(null);

  const investmentResult = proposalResults?.investment ?? null;
  const serviceResult =
    proposalResults?.service ?? proposalResults?.investment ?? null;

  const [selectedInstallation, setSelectedInstallation] =
    useState<ApiInstallation | null>(null);

  const normalizedInstallationModalidad = normalizeInstallationModalidad(
    selectedInstallation?.modalidad,
  );

  const availableProposalModes = getAvailableProposalModes(
    normalizedInstallationModalidad,
  );

  const defaultProposalMode = getDefaultProposalMode(
    normalizedInstallationModalidad,
  );
  console.log(
    "[DEBUG] modalidad instalación:",
    selectedInstallation?.modalidad,
  );
  console.log("[DEBUG] availableProposalModes:", availableProposalModes);
  console.log("[DEBUG] instalación seleccionada:", selectedInstallation);

  // const defaultProposalMode = getDefaultProposalMode(
  //   selectedInstallation?.modalidad,
  // );

  const hasMultipleProposalModes = availableProposalModes.length > 1;

  const canCompareProposalModes =
    availableProposalModes.includes("investment") &&
    availableProposalModes.includes("service");

  const activeProposalMode: ProposalMode = availableProposalModes.includes(
    selectedProposalView,
  )
    ? selectedProposalView
    : defaultProposalMode;

  const activeCalculationResult =
    activeProposalMode === "service"
      ? (serviceResult ?? investmentResult)
      : investmentResult;

  const investmentProposal = buildProposalCardData(
    investmentResult,
    "investment",
    selectedInstallation,
    t,
  );
  const [clientCoordinates, setClientCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const clientCoords = clientCoordinates;
  const contractAlreadySigned = Boolean(signedContractResult?.contract?.id);
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
    return formatPaybackYears(proposal.paybackYears);
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
    t,
  );

  const activeProposal =
    activeProposalMode === "service" ? serviceProposal : investmentProposal;
  const activeModeLabel = activeProposal.title;
  const activeModeLabelLower = activeModeLabel.toLowerCase();
  const contractPreviewModeLabel =
    generatedContract?.preview?.proposalMode === "service"
      ? t("result.modes.service", "Servicio").toLowerCase()
      : t("result.modes.investment", "Inversión").toLowerCase();

  const reserveCardTitle = contractAlreadySigned
    ? t("result.reserve.startedTitle")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.title")
      : t("result.reserve.service.title");

  const reserveCardDescription = contractAlreadySigned
    ? activeProposal.id === "investment"
      ? t("result.reserve.startedDescriptionInvestment")
      : t("result.reserve.startedDescriptionService")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.description")
      : t("result.reserve.service.description");

  const reserveButtonText = contractAlreadySigned
    ? t("result.reserve.reserved")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.title")
      : t("result.reserve.service.title");
  const investmentMetrics = getProposalMetrics(investmentProposal);
  const serviceMetrics = getProposalMetrics(serviceProposal);
  const activeMetrics = getProposalMetrics(activeProposal);

  const proposalByMode: Record<ProposalMode, ProposalCardData> = {
    investment: investmentProposal,
    service: serviceProposal,
  };
  const getModeVisualName = (mode: ProposalMode) =>
    mode === "investment" ? "Inversión" : "Servicio";
  const visibleProposalPanels = availableProposalModes.map(
    (mode) => proposalByMode[mode],
  );
  const topPrimaryResumeCard = {
    label:
      activeProposal.id === "investment"
        ? t("result.summary.totalInvestment")
        : t("result.summary.monthlyCost"),
    value:
      activeProposal.id === "investment"
        ? formatCurrency(activeProposal.upfrontCost)
        : activeProposal.monthlyFee && activeProposal.monthlyFee > 0
          ? `${formatCurrency(activeProposal.monthlyFee)} / ${t("result.units.month")}`
          : t("result.summary.noFee"),
    icon:
      activeProposal.id === "investment"
        ? "solar:wallet-money-bold-duotone"
        : "solar:card-send-bold-duotone",
  };

  const topSecondaryResumeCard = {
    label: t("result.summary.annualSavings"),
    value: formatCurrency(activeProposal.annualSavings),
    helper: t("result.summary.monthlySavingsHelper", {
      value: formatCurrency(activeProposal.annualSavings / 12),
    }),
    icon: "solar:graph-up-bold-duotone",
  };

  const topActiveMetrics = [
    {
      label: t("result.summary.investment"),
      value:
        activeProposal.id === "investment"
          ? formatCurrency(activeProposal.upfrontCost)
          : t("result.summary.noInitialInvestment"),
      icon: "solar:calculator-bold-duotone",
    },
    {
      label:
        activeProposal.id === "investment"
          ? t("result.summary.return")
          : t("result.summary.monthlyFee"),
      value:
        activeProposal.id === "investment"
          ? activeProposal.paybackYears > 0
            ? `${Math.round(activeProposal.paybackYears)} ${t("result.units.years")}`
            : "-"
          : activeProposal.monthlyFee && activeProposal.monthlyFee > 0
            ? `${formatCurrency(activeProposal.monthlyFee)} / ${t("result.units.month")}`
            : t("result.summary.noFee"),
      icon:
        activeProposal.id === "investment"
          ? "solar:graph-up-bold-duotone"
          : "solar:wallet-money-bold-duotone",
    },
    {
      label: t("result.summary.recommendedPower"),
      value: `${formatNumber(activeProposal.recommendedPowerKwp)} kWp`,
      icon: "solar:bolt-bold-duotone",
    },
    {
      label: t("result.summary.annualConsumption"),
      value: `${Math.round(activeProposal.annualConsumptionKwh)} kWh`,
      icon: "solar:chart-2-bold-duotone",
    },
  ];

  const activeProposalStats =
    activeProposal.id === "investment"
      ? [
          {
            label: "Ahorro anual",
            value: activeMetrics.annualSavings,
          },
          {
            label: "Ahorro 25 años",
            value: activeMetrics.totalSavings25Years,
          },
          {
            label: "Coste inicial",
            value: activeMetrics.upfrontCost,
          },
          // {
          //   label: "Rentabilidad",
          //   value: activeMetrics.payback,
          // },
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

  const featuredResumeCard = topSecondaryResumeCard;
  // const featuredResumeCard =
  //   [topPrimaryResumeCard, topSecondaryResumeCard].find((card) =>
  //     /ahorro total/i.test(card.label),
  //   ) ??
  //   topSecondaryResumeCard ??
  //   topPrimaryResumeCard;
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

  const economicChartData = buildEconomicChartData(
    investmentProposal,
    serviceProposal,
  );

  useEffect(() => {
    if (selectedProposalView !== activeProposalMode) {
      setSelectedProposalView(activeProposalMode);
    }
  }, [selectedProposalView, activeProposalMode]);

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
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ValidationBillDataFormInput, unknown, ValidationBillData>({
    resolver: zodResolver(ValidationBillDataSchema),
    defaultValues: {
      billType: "2TD",
    },
  });

  // const handleRoundUpBlur = (
  //   fieldName: keyof ValidationBillDataFormInput,
  //   decimals: number,
  // ) => {
  //   return (e: React.FocusEvent<HTMLInputElement>) => {
  //     const rounded = normalizeAndRoundUp(e.target.value, decimals);

  //     if (rounded === undefined) return;

  //     setValue(fieldName, rounded as any, {
  //       shouldValidate: true,
  //       shouldDirty: true,
  //       shouldTouch: true,
  //     });
  //   };
  // };

  // const watchedBillType = watch("billType");
  // const watchedAverageMonthlyConsumption = watch(
  //   "averageMonthlyConsumptionKwh",
  // );
  // // useEffect(() => {
  // //   if (currentStep === "map") {
  // //     void fetchInstallations();
  // //   }
  // // }, [currentStep, rawExtraction]);

  // useEffect(() => {
  //   const parsed = parseFormNumber(watchedAverageMonthlyConsumption);
  //   if (typeof parsed === "number" && Number.isFinite(parsed)) {
  //     setValue("monthlyConsumption", parsed, {
  //       shouldValidate: false,
  //       shouldDirty: false,
  //     });
  //   }
  // }, [watchedAverageMonthlyConsumption, setValue]);

  const handleDownloadPDF = async () => {
    if (!activeCalculationResult || !extractedData || !selectedInstallation)
      return;

    sileo.promise(
      (async () => {
        const billData = toBaseBillData(extractedData);

        const pdfSummaries = buildProposalPdfSummariesForInstallation(
          activeCalculationResult,
          selectedInstallation,
          t,
        );

        const pdfArtifact = await buildPdfArtifact(
          billData,
          activeCalculationResult,
          pdfSummaries,
          currentAppLanguage,
        );

        savePdfArtifactLocally(
          pdfArtifact,
          `Estudio_Solar_${billData.name || "cliente"}.pdf`,
        );
      })(),
      {
        loading: {
          title: t(
            "toasts.pdf.generatingTitle",
            "Generando tu estudio en PDF...",
          ),
        },
        success: {
          title: t(
            "toasts.pdf.generatedTitle",
            "PDF generado y descargado con éxito",
          ),
        },
        error: {
          title: t(
            "toasts.pdf.generateErrorTitle",
            "No se pudo generar el PDF",
          ),
        },
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

    const initialProposalMode = getDefaultProposalMode(installation.modalidad);

    const proposalSummariesForPdf = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    const pdfArtifact = await buildPdfArtifact(
      billData,
      result,
      proposalSummariesForPdf,
      currentAppLanguage,
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

   const assignedKwpForStudy = resolveEffectiveAssignedKwpForInstallation(
  validatedData,
  installation,
  rawExtraction,
);
    console.log("[FRONT] -  assignedKwpForStudy: ", assignedKwpForStudy);

    const response = await confirmStudy({
      invoiceFile: uploadedInvoiceFile,
      proposalFile,
      customer: customerPayload,
      location: locationPayload,
      invoiceData: invoiceDataPayload,
      calculation: result,
      selectedInstallationId: installation.id,
      selectedInstallationSnapshot: installation,
      assignedKwp: assignedKwpForStudy,
      language: currentAppLanguage,
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

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureHasContent(false);
  };

  const getCanvasPoint = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startSignatureDraw = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    if ("touches" in event) {
      event.preventDefault();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(event, canvas);

    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#07005f";
    ctx.beginPath();
    ctx.moveTo(x, y);

    signatureDrawingRef.current = true;
    setSignatureHasContent(true);
  };

  const moveSignatureDraw = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!signatureDrawingRef.current) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    if ("touches" in event) {
      event.preventDefault();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(event, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endSignatureDraw = () => {
    signatureDrawingRef.current = false;
  };

  const buildSignedContractPdfFile = async (
    preview: ContractPreviewData,
    signatureDataUrl: string,
    language: AppLanguage,
  ) => {
    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
    });

    const locale = getDateLocale(language);

    const contractTexts = {
      title: t("contractPdf.title"),
      contractNumber: t("contractPdf.contractNumber"),
      date: t("contractPdf.date"),
      clientData: t("contractPdf.clientData"),
      name: t("contractPdf.name"),
      dni: t("contractPdf.dni"),
      email: t("contractPdf.email"),
      phone: t("contractPdf.phone"),
      installationData: t("contractPdf.installationData"),
      installation: t("contractPdf.installation"),
      mode: t("contractPdf.mode"),
      assignedKwp: t("contractPdf.assignedKwp"),
      basicConditions: t("contractPdf.basicConditions"),
      condition1: t("contractPdf.condition1"),
      condition2: t("contractPdf.condition2"),
      condition3: t("contractPdf.condition3"),
      clientSignature: t("contractPdf.clientSignature"),
      investment: t("contractPdf.modes.investment"),
      service: t("contractPdf.modes.service"),
    };

    const margin = 48;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin * 2;
    let y = 56;

    const writeSectionTitle = (title: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(7, 0, 95);
      pdf.text(title, margin, y);
      y += 20;
    };

    const writeParagraph = (text: string) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(40, 40, 40);

      const lines = pdf.splitTextToSize(text, usableWidth);
      pdf.text(lines, margin, y);
      y += lines.length * 14 + 8;
    };

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(7, 0, 95);
    pdf.text(contractTexts.title, margin, y);
    y += 24;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(90, 90, 90);
    pdf.text(
      `${contractTexts.contractNumber} ${preview.contractNumber}`,
      margin,
      y,
    );
    y += 26;

    writeSectionTitle(contractTexts.clientData);
    writeParagraph(
      `${contractTexts.name}: ${preview.client.nombre} ${preview.client.apellidos}`,
    );
    writeParagraph(`${contractTexts.dni}: ${preview.client.dni}`);
    writeParagraph(`${contractTexts.email}: ${preview.client.email || "-"}`);
    writeParagraph(`${contractTexts.phone}: ${preview.client.telefono || "-"}`);

    writeSectionTitle(contractTexts.installationData);
    writeParagraph(
      `${contractTexts.installation}: ${preview.installation.nombre_instalacion}`,
    );
    writeParagraph(`${t("fields.address")}: ${preview.installation.direccion}`);
    writeParagraph(
      `${contractTexts.mode}: ${
        preview.proposalMode === "investment"
          ? contractTexts.investment
          : contractTexts.service
      }`,
    );
    writeParagraph(`${contractTexts.assignedKwp}: ${preview.assignedKwp}`);

    writeSectionTitle(contractTexts.basicConditions);
    writeParagraph(contractTexts.condition1);
    writeParagraph(contractTexts.condition2);
    writeParagraph(contractTexts.condition3);

    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(7, 0, 95);
    pdf.text(contractTexts.clientSignature, margin, y);
    y += 12;

    pdf.addImage(signatureDataUrl, "PNG", margin, y, 180, 70);

    const safeDni = preview.client.dni.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeName = `${preview.client.nombre}_${preview.client.apellidos}`
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    const blob = pdf.output("blob");

    return new File([blob], `CONTRATO_${safeDni}_${safeName}.pdf`, {
      type: "application/pdf",
    });
  };

  const handleGenerateContract = async () => {
    const studyId = savedStudy?.study?.id;

    if (!studyId) {
      sileo.error({
        title: "No hay estudio disponible",
        description:
          "Primero debe haberse guardado correctamente el estudio antes de iniciar la reserva.",
      });
      return;
    }

    setIsGeneratingContract(true);

    try {
      const response = await axios.post<GeneratedContractResponse>(
        `/api/contracts/generate-from-study/${studyId}`,
        {
          proposalMode: activeProposal.id,
          language: currentAppLanguage,
        },
      );

      setGeneratedContract(response.data);
      setIsContractModalOpen(true);

      window.setTimeout(() => {
        clearSignature();
      }, 80);
    } catch (error: any) {
      console.error("Error generando contrato:", error);

      sileo.error({
        title: "No se pudo generar el contrato",
        description:
          error?.response?.data?.details ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsGeneratingContract(false);
    }
  };
  const currentContractId =
    signedContractResult?.contract?.id ??
    generatedContract?.contract?.id ??
    null;
  const handleSubmitSignedContract = async () => {
    if (!generatedContract?.contract?.id || !generatedContract?.preview) {
      sileo.error({
        title: "Precontrato no disponible",
        description: "No se ha podido preparar el precontrato para firmar.",
      });
      return;
    }

    if (!signatureHasContent || !signatureCanvasRef.current) {
      sileo.warning({
        title: "Falta la firma",
        description: "Debes firmar en el recuadro antes de continuar.",
      });
      return;
    }

    setIsSigningContract(true);

    try {
      const signatureDataUrl =
        signatureCanvasRef.current.toDataURL("image/png");

      const signedPdfFile = await buildSignedContractPdfFile(
        generatedContract.preview,
        signatureDataUrl,
        currentAppLanguage,
      );

      const formData = new FormData();
      formData.append("signed_contract", signedPdfFile);

      const response = await axios.post<SignedContractResponse>(
        `/api/contracts/${generatedContract.contract.id}/sign`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      console.log("RESPUESTA /sign:", response.data);

      setSignedContractResult(response.data);
      setIsContractModalOpen(false);
      setIsPaymentMethodModalOpen(true);
      sileo.success({
        title: t(
          "contractFlow.toasts.signedSuccessTitle",
          "Precontrato firmado correctamente",
        ),
        description: t(
          "contractFlow.toasts.signedSuccessDescription",
          "Se han reservado {{reservedKwp}} kWp en {{installationName}}. Ahora debes seleccionar la forma de pago para continuar.",
          {
            reservedKwp: response.data.reservation.reservedKwp,
            installationName: response.data.reservation.installationName,
          },
        ),
      });
    } catch (error: any) {
      console.error("Error firmando precontrato:", error);
      console.error("status:", error?.response?.status);
      console.error("data:", error?.response?.data);

      sileo.error({
        title: "No se pudo iniciar la reserva",
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsSigningContract(false);
    }
  };

  const handleSelectStripePayment = async () => {
    if (!currentContractId) {
      sileo.error({
        title: t(
          "contractFlow.toasts.contractUnavailableTitle",
          "Contrato no disponible",
        ),
        description: t(
          "contractFlow.toasts.paymentContractUnavailableDescription",
          "No se ha encontrado el contrato para iniciar el pago.",
        ),
      });
      return;
    }

    setIsSelectingPaymentMethod(true);

    try {
      const response = await axios.post<StripePaymentResponse>(
        `/api/contracts/${currentContractId}/payments/stripe`,
      );

      const checkoutUrl = response.data?.stripe?.checkoutUrl;

      if (!checkoutUrl) {
        sileo.error({
          title: t(
            "contractFlow.toasts.paymentUnavailableTitle",
            "Pago no disponible",
          ),
          description: t(
            "contractFlow.toasts.paymentUnavailableDescription",
            "No se pudo obtener la URL de Stripe.",
          ),
        });
        return;
      }

      sileo.success({
        title: t(
          "contractFlow.toasts.redirectingStripeTitle",
          "Redirigiendo a Stripe",
        ),
        description: t(
          "contractFlow.toasts.redirectingStripeDescription",
          "Te llevamos al pago seguro con tarjeta.",
        ),
      });

      window.location.href = checkoutUrl;
    } catch (error: any) {
      console.error("Error iniciando pago con Stripe:", error);

      sileo.error({
        title: t(
          "contractFlow.toasts.couldNotStartStripeTitle",
          "No se pudo iniciar el pago con tarjeta",
        ),
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          t(
            "contractFlow.toasts.unexpectedError",
            "Ha ocurrido un error inesperado.",
          ),
      });
    } finally {
      setIsSelectingPaymentMethod(false);
    }
  };

  const handleSelectBankTransferPayment = async () => {
    if (!currentContractId) {
      sileo.error({
        title: t(
          "contractFlow.toasts.contractUnavailableTitle",
          "Contrato no disponible",
        ),
        description: t(
          "contractFlow.toasts.paymentContractUnavailableDescription",
          "No se ha encontrado el contrato para iniciar el pago.",
        ),
      });
      return;
    }

    setIsSelectingPaymentMethod(true);

    try {
      const response = await axios.post<BankTransferPaymentResponse>(
        `/api/contracts/${currentContractId}/payments/bank-transfer`,
      );

      setIsPaymentMethodModalOpen(false);

      sileo.success({
        title: t(
          "contractFlow.toasts.bankTransferSentTitle",
          "Instrucciones enviadas",
        ),
        description: t(
          "contractFlow.toasts.bankTransferSentDescription",
          "Hemos enviado el email con las instrucciones de transferencia a {{email}}.",
          { email: response.data.bankTransfer.emailSentTo },
        ),
      });
    } catch (error: any) {
      console.error("Error seleccionando transferencia bancaria:", error);

      sileo.error({
        title: "No se pudo preparar el pago por transferencia",
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsSelectingPaymentMethod(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!privacyAccepted) {
      sileo.warning({
        title: t(
          "toasts.upload.privacyRequiredTitle",
          "Debes aceptar la política de privacidad",
        ),
        description: t(
          "toasts.upload.privacyRequiredDescription",
          "Para subir la factura y continuar, debes aceptar el tratamiento de datos.",
        ),
      });
      return;
    }

    setUploadedInvoiceFile(file);

    sileo.promise(
      (async () => {
        const extraction = await extractBillFromApi(file);
        console.log(
          "[POWER DEBUG] contractedPowerText:",
          extraction.invoice_data?.contractedPowerText,
        );
        console.log(
          "[POWER DEBUG] contractedPowerKw:",
          extraction.invoice_data?.contractedPowerKw,
        );
        console.log(
          "[POWER DEBUG] contractedPowerP1:",
          extraction.invoice_data?.contractedPowerP1,
        );
        console.log(
          "[POWER DEBUG] contractedPowerP2:",
          extraction.invoice_data?.contractedPowerP2,
        );
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
        if (mappedData.contractedPowerText) {
          setValue("contractedPowerText", mappedData.contractedPowerText);
        }

        if (typeof mappedData.contractedPowerKw === "number") {
          setValue("contractedPowerKw", mappedData.contractedPowerKw);
        }

        if (typeof mappedData.contractedPowerP1 === "number") {
          setValue("contractedPowerP1", mappedData.contractedPowerP1);
        }

        if (typeof mappedData.contractedPowerP2 === "number") {
          setValue("contractedPowerP2", mappedData.contractedPowerP2);
        }

        if (mappedData.ibanMasked) {
          setValue("ibanMasked", mappedData.ibanMasked);
        }

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

        if (mappedData.contractedPowerText) {
          setValue("contractedPowerText", mappedData.contractedPowerText);
        }

        if (typeof mappedData.contractedPowerKw === "number") {
          setValue("contractedPowerKw", mappedData.contractedPowerKw);
        }

        if (typeof mappedData.contractedPowerP1 === "number") {
          setValue("contractedPowerP1", mappedData.contractedPowerP1);
        }

        if (typeof mappedData.contractedPowerP2 === "number") {
          setValue("contractedPowerP2", mappedData.contractedPowerP2);
        }

        if (mappedData.ibanMasked) {
          setValue("ibanMasked", mappedData.ibanMasked);
        }

        setCurrentStep("validation");
        showExtractionToasts(extraction, t);

        console.log(
          "[EXTRACTION] invoice_data completo:",
          extraction.invoice_data,
        );
        console.log("[EXTRACTION] customer completo:", extraction.customer);
        console.log("[EXTRACTION] potencia mapeada:", {
          contractedPowerText: mappedData.contractedPowerText,
          contractedPowerKw: mappedData.contractedPowerKw,
          contractedPowerP1: mappedData.contractedPowerP1,
          contractedPowerP2: mappedData.contractedPowerP2,
        });

        return extraction;
      })(),
      {
        loading: {
          title: t("toasts.upload.processingInvoice", "Procesando factura..."),
        },
        success: {
          title: t(
            "toasts.upload.invoiceProcessedSuccess",
            "Factura procesada con éxito",
          ),
        },
        error: {
          title: t(
            "toasts.upload.invoiceProcessedError",
            "No se pudo extraer la información de la factura",
          ),
        },
      },
    );
  };

  const onValidationSubmit = (data: ValidationBillData) => {
    sileo.promise(
      (async () => {
        const normalizedData: ValidationBillData = {
          ...(extractedData ?? {}),
          ...data,
          monthlyConsumption:
            data.averageMonthlyConsumptionKwh ??
            extractedData?.averageMonthlyConsumptionKwh ??
            data.monthlyConsumption ??
            extractedData?.monthlyConsumption ??
            0,
        };

        setExtractedData(normalizedData);
        setProposalResults(null);
        setSelectedProposalView("investment");
        setSelectedInstallation(null);
        setInstallationAvailabilityError(null);

        const coords = await geocodeAddress(normalizedData.address);

        if (!coords) {
          setClientCoordinates(null);
          setInstallations([]);
          setCurrentStep("map");

          sileo.error({
            title: t(
              "toasts.map.geocodeErrorTitle",
              "No se pudo localizar la dirección",
            ),
            description: t(
              "toasts.map.geocodeErrorDescription",
              "No hemos podido obtener las coordenadas de la dirección indicada.",
            ),
          });

          return;
        }

        setClientCoordinates(coords);
        setCurrentStep("map");
        await fetchInstallations(coords, normalizedData);

        sileo.success({ title: "Datos validados correctamente" });
      })(),
      {
        loading: {
          title: t(
            "toasts.validation.validatingLocationLoading",
            "Validando dirección y buscando instalaciones...",
          ),
        },
        success: {
          title: t(
            "toasts.validation.validatedSuccess",
            "Datos validados correctamente",
          ),
        },
        error: {
          title: t(
            "toasts.validation.validationError",
            "No se pudo validar la ubicación del cliente",
          ),
        },
      },
    );
  };

  const fetchInstallations = async (
    coordsParam?: { lat: number; lng: number } | null,
    validatedDataParam?: ValidationBillData | null,
  ) => {
    const coords = coordsParam ?? clientCoordinates;
    const validatedData =
      validatedDataParam ?? (extractedData as ValidationBillData | null);

    if (!coords) {
      setInstallations([]);
      setInstallationAvailabilityError("no_installations_in_radius");
      sileo.error({
        title: t(
          "toasts.map.locationUnavailableTitle",
          "Ubicación no disponible",
        ),
        description: t(
          "toasts.map.locationUnavailableDescription",
          "No se ha podido obtener la latitud y longitud del cliente.",
        ),
      });
      return;
    }

    if (!validatedData) {
      setInstallations([]);
      sileo.error({
        title: t("toasts.map.insufficientDataTitle", "Datos insuficientes"),
        description: t(
          "toasts.map.insufficientDataDescription",
          "No se han encontrado los datos validados del cliente para calcular la potencia necesaria.",
        ),
      });
      return;
    }

    setIsLoadingInstallations(true);
    setInstallationAvailabilityError(null);

    try {
      const response = await axios.get<
        ApiInstallation[] | { data: ApiInstallation[] }
      >("/api/installations", {
        params: {
          lat: coords.lat,
          lng: coords.lng,
          radius: 5000,
        },
      });

      const responseData = response.data;
      const parsedInstallations = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

      const installationsInRadius = parsedInstallations
        .filter((item) => item.active !== false)
        .map((item) => ({
          ...item,
          modalidad: normalizeInstallationModalidad(item.modalidad),
        }));

      if (installationsInRadius.length === 0) {
        setInstallations([]);
        setInstallationAvailabilityError("no_installations_in_radius");
        return;
      }

const eligibleInstallations = installationsInRadius
  .map((item) => {
    const requiredKwp = resolveEffectiveAssignedKwpForInstallation(
      validatedData,
      item,
      rawExtraction,
    );

    return {
      ...item,
      required_kwp: requiredKwp,
    };
  })
        .filter((item) => {
          const availableKwp = Number(item.available_kwp ?? 0);
          const requiredKwp = Number(item.required_kwp ?? 0);

          return (
            Number.isFinite(requiredKwp) &&
            requiredKwp > 0 &&
            availableKwp >= requiredKwp
          );
        });

      if (eligibleInstallations.length === 0) {
        setInstallations([]);
        setInstallationAvailabilityError("insufficient_capacity");
        return;
      }

      setInstallations(eligibleInstallations);
    } catch (error) {
      console.error("Error fetching installations:", error);
      sileo.error({
        title: t(
          "toasts.map.loadInstallationsErrorTitle",
          "Error al cargar instalaciones",
        ),
        description: t(
          "toasts.map.loadInstallationsErrorDescription",
          "Inténtalo de nuevo más tarde",
        ),
      });
      setInstallations([]);
      setInstallationAvailabilityError(null);
    } finally {
      setIsLoadingInstallations(false);
    }
  };
  const handleInstallationSelect = (inst: ApiInstallation) => {
    const normalizedInst: ApiInstallation = {
      ...inst,
      modalidad: normalizeInstallationModalidad(inst.modalidad),
    };

    const availableKwp = Number(normalizedInst.available_kwp ?? 0);
    const requiredKwp = Number(normalizedInst.required_kwp ?? 0);

    if (requiredKwp > 0 && availableKwp < requiredKwp) {
      sileo.error({
        title: t(
          "toasts.map.insufficientCapacityTitle",
          "Capacidad insuficiente",
        ),
        description: t(
          "toasts.map.insufficientCapacityDescription",
          "Esta instalación no dispone de potencia suficiente para cubrir la recomendación del estudio.",
        ),
      });
      return;
    }

    setSelectedInstallation(normalizedInst);
    setSelectedProposalView(getDefaultProposalMode(normalizedInst.modalidad));
    setCurrentStep("calculation");
  };

useEffect(() => {
  if (currentStep !== "calculation") return;
  if (!extractedData || !selectedInstallation) return;

  const timer = window.setTimeout(() => {
    const validatedData = extractedData as ValidationBillData;

    const periodConsumptions = {
      P1: validatedData.periodConsumptionP1,
      P2: validatedData.periodConsumptionP2,
      P3: validatedData.periodConsumptionP3,
      P4: validatedData.periodConsumptionP4,
      P5: validatedData.periodConsumptionP5,
      P6: validatedData.periodConsumptionP6,
    };

    const periodPrices = {
      P1: validatedData.periodPriceP1,
      P2: validatedData.periodPriceP2,
      P3: validatedData.periodPriceP3,
      P4: validatedData.periodPriceP4,
      P5: validatedData.periodPriceP5,
      P6: validatedData.periodPriceP6,
    };

    const invoiceVariableEnergyAmountEur =
      getInvoiceVariableEnergyAmountFromExtraction(rawExtraction);

    const fixedPower = getFixedInstallationPower(selectedInstallation);

    const result = calculateEnergyStudy({
      monthlyConsumptionKwh:
        validatedData.averageMonthlyConsumptionKwh ??
        validatedData.monthlyConsumption ??
        0,
      invoiceConsumptionKwh:
        validatedData.currentInvoiceConsumptionKwh ??
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
      periodPrices,
      periodConsumptions,
      invoiceVariableEnergyAmountEur,
      surplusCompensationPriceKwh:
        selectedInstallation.precio_excedentes_eur_kwh ?? 0,
      maintenanceAnnualPerKwp:
        selectedInstallation.coste_anual_mantenimiento_por_kwp ??
        INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
      vatRate: 0.21,
      forcedPowerKwp: fixedPower ?? undefined,
    });

    setProposalResults({
      investment: result,
      service: result,
    });
    setSelectedProposalView(
      getDefaultProposalMode(selectedInstallation.modalidad),
    );
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
          title: t(
            "toasts.study.savedTitle",
            "Propuesta guardada automáticamente",
          ),
          description: t(
            "toasts.study.savedDescription",
            "Cliente, factura, propuesta y estudio registrados.",
          ),
        });
      } catch (error: any) {
        console.error("Error guardando estudio confirmado:", error);
        console.error("error.message:", error?.message);
        console.error("error.response?.data:", error?.response?.data);
        console.error("error.response?.status:", error?.response?.status);

        sileo.error({
          title: t(
            "toasts.study.saveErrorTitle",
            "El estudio se generó, pero no se pudo guardar",
          ),
          description:
            error?.response?.data?.details ||
            error?.message ||
            t(
              "toasts.study.saveErrorDescription",
              "Revisa la configuración del servidor.",
            ),
        });
      } finally {
        studyPersistLock.current = false;
      }
    })();
  }, 2500);

  return () => window.clearTimeout(timer);
}, [currentStep, extractedData, selectedInstallation, rawExtraction, t]);

  return (
    <Layout>
      {/* Selector idioma */}
      <div className="fixed top-8 right-6 z-[101]">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsLanguageMenuOpen((prev) => !prev)}
            className="group flex items-center justify-center w-14 h-14 rounded-2xl border border-white/40 bg-white/60 backdrop-blur-2xl shadow-[0_16px_40px_rgba(7,0,95,0.12)] hover:shadow-[0_20px_50px_rgba(7,0,95,0.16)] transition-all"
            aria-label="Seleccionar idioma"
            title="Seleccionar idioma"
          >
            <Icon
              icon="solar:global-bold-duotone"
              className="w-7 h-7 text-brand-navy group-hover:scale-110 transition-transform"
            />
          </button>

          <AnimatePresence>
            {isLanguageMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute top-16 right-0 w-56 rounded-[1.8rem] border border-white/40 bg-white/70 backdrop-blur-2xl p-2 shadow-[0_20px_60px_rgba(7,0,95,0.15)]"
              >
                {[
                  {
                    code: "es",
                    short: "ES",
                    name: "Castellano",
                    flag: "/flags/es.png",
                  },
                  {
                    code: "ca",
                    short: "CA",
                    name: "Català",
                    flag: "/flags/ca.png",
                  },
                  {
                    code: "val",
                    short: "VAL",
                    name: "Valencià",
                    flag: "/flags/val.png",
                  },
                  {
                    code: "gl",
                    short: "GL",
                    name: "Galego",
                    flag: "/flags/gal.png",
                  },
                ].map((lang) => {
                  const active = i18n.language === lang.code;

                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        i18n.changeLanguage(lang.code);
                        setIsLanguageMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-[1.2rem] px-3 py-3 text-left transition-all",
                        active
                          ? "brand-gradient text-brand-navy shadow-md"
                          : "text-brand-navy/75 hover:bg-white hover:text-brand-navy",
                      )}
                    >
                      <img
                        src={lang.flag}
                        alt={lang.name}
                        className="w-9 h-9 rounded-full object-cover border border-black/5"
                      />

                      <div className="flex flex-col leading-none">
                        <span className="text-sm font-extrabold tracking-[0.12em]">
                          {lang.short}
                        </span>
                        <span className="mt-1 text-[11px] font-medium opacity-70">
                          {lang.name}
                        </span>
                      </div>

                      <div className="ml-auto">
                        {active ? (
                          <Icon
                            icon="solar:check-circle-bold-duotone"
                            className="w-5 h-5 text-brand-navy"
                          />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="fixed bottom-8 right-8 z-[100]">
        <Button
          variant="ghost"
          size="sm"
          className="glass-card rounded-full px-6 py-3 font-bold text-brand-navy/60 hover:text-brand-navy border-brand-navy/5 shadow-xl"
          onClick={() => setView(view === "public" ? "admin" : "public")}
        >
          {view === "public" ? t("admin.access") : t("admin.backToSite")}
        </Button>
      </div>
      <div className="fixed bottom-8 right-8 z-[100]">
        <Button
          variant="ghost"
          size="sm"
          className="glass-card rounded-full px-6 py-3 font-bold text-brand-navy/60 hover:text-brand-navy border-brand-navy/5 shadow-xl"
          onClick={() => setView(view === "public" ? "admin" : "public")}
        >
          {view === "public" ? t("admin.access") : t("admin.backToSite")}{" "}
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
          <div
            className={cn(
              "mx-auto",
              currentStep === "result" ? "max-w-[1380px]" : "max-w-5xl",
            )}
          >
            {" "}
            <div className="mb-12 md:mb-20 relative px-4">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-brand-navy/5 -translate-y-1/2 rounded-full" />
              <div className="relative flex justify-between items-center">
                {[
                  { label: t("steps.upload"), icon: Upload },
                  { label: t("steps.validation"), icon: FileText },
                  { label: t("steps.location"), icon: MapPin },
                  { label: t("steps.result"), icon: Zap },
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


                  <div className="max-w-2xl mx-auto mb-8 text-left">
                    <label className="flex items-start gap-3 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm">
                      <input
                        type="checkbox"
                        checked={privacyAccepted}
                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 rounded border-brand-navy/20 text-brand-mint focus:ring-brand-mint"
                      />

                      <span className="text-sm text-brand-gray leading-relaxed">
                        <Trans
                          i18nKey="upload.privacyConsent"
                          components={{
                            privacyLink: (
                              <a
                                href={`/politica-privacidad.html?lang=${currentAppLanguage}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-brand-navy underline underline-offset-4 hover:text-brand-mint"
                              />
                            ),
                          }}
                        />
                      </span>
                    </label>
                  </div>

                  <FileUploader
                    onFileSelect={handleFileSelect}
                    disabled={!privacyAccepted}
                    disabledMessage={t("upload.disabledMessage")}
                  />

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
                      {t("validation.title")}
                    </h2>
                    <p className="text-brand-gray">
                      {t("validation.description")}
                    </p>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-10 border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
                    <form
                      onSubmit={handleSubmit(onValidationSubmit)}
                      className="space-y-10"
                    >
                      <FormSection
                        title={t("validation.ownerSection.title")}
                        subtitle={t("validation.ownerSection.subtitle")}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <Input
                            label={t("fields.name")}
                            {...register("name")}
                            error={errors.name?.message}
                            placeholder={t("placeholders.name")}
                          />

                          <Input
                            label={t("fields.lastName")}
                            {...register("lastName")}
                            error={errors.lastName?.message}
                            placeholder={t("placeholders.lastName")}
                          />

                          <Input
                            label={t("fields.dni")}
                            {...register("dni")}
                            error={errors.dni?.message}
                            placeholder={t("placeholders.dni")}
                          />

                          <Input
                            label={t("fields.email")}
                            {...register("email")}
                            error={errors.email?.message}
                            placeholder={t("placeholders.email")}
                          />

                          <Input
                            label={t("fields.phone")}
                            {...register("phone")}
                            error={errors.phone?.message}
                            placeholder={t("placeholders.phone")}
                          />

                          <Input
                            label={t("fields.address")}
                            {...register("address")}
                            error={errors.address?.message}
                            placeholder={t("placeholders.address")}
                          />
                        </div>
                      </FormSection>



                      <div className="flex justify-center pt-4">
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full md:w-auto px-12 py-7 text-lg rounded-2xl"
                        >
                          {t("common.confirmAndContinue")}
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
                      {t("map.title")}
                    </h2>
                    <p className="text-brand-gray">{t("map.description")}</p>
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
                            <Popup>{t("map.clientLocation")}</Popup>{" "}
                          </Marker>

                          <Circle
                            center={[clientCoords.lat, clientCoords.lng]}
                            radius={5000}
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
                                    {t(
                                      "map.distanceLabel",
                                      "Distancia: {{value}} m",
                                      {
                                        value: inst.distance_meters ?? "-",
                                      },
                                    )}
                                  </p>
                                </div>
                              </Popup>
                            </Marker>
                          ))}
                        </MapContainer>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/[0.02] text-brand-navy/40 font-bold">
                          {t(
                            "map.missingCoordinates",
                            "No se ha podido cargar el mapa porque faltan coordenadas.",
                          )}
                        </div>
                      )}

                      <div className="absolute bottom-8 left-8 right-8 glass-card p-6 rounded-3xl flex items-center justify-between z-[400]">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white">
                            <MapPin className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              {t("map.yourLocation")}
                            </p>
                            <p className="font-bold text-brand-navy">
                              {extractedData?.address ||
                                t(
                                  "map.loadingAddress",
                                  "Cargando dirección...",
                                )}
                            </p>
                          </div>
                        </div>

                        <div className="hidden md:block px-4 py-2 bg-brand-mint/20 text-brand-navy text-[10px] font-bold rounded-full uppercase tracking-widest">
                          {t("map.availableInstallations", {
                            count: installations.length,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-96 flex flex-col gap-6 overflow-y-auto pr-4 custom-scrollbar">
                      <h3 className="font-bold text-xl text-brand-navy flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-mint" />
                        {t("map.recommendedPlants")}
                      </h3>

                      {isLoadingInstallations ? (
                        <div className="flex flex-col items-center justify-center py-12 text-brand-navy/40">
                          <Loader2 className="w-8 h-8 animate-spin mb-4" />
                          <p className="text-sm font-bold uppercase tracking-widest">
                            {t("map.searchingPlants")}
                          </p>
                        </div>
                      ) : installations.length === 0 ? (
                        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-6 text-left">
                          <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
                            {installationAvailabilityError ===
                            "insufficient_capacity"
                              ? t(
                                  "map.availability.noCapacityTitle",
                                  "No hay capacidad suficiente disponible",
                                )
                              : t(
                                  "map.availability.noInstallationsTitle",
                                  "No hay instalaciones disponibles",
                                )}
                          </p>

                          <p className="text-sm text-amber-700/80 mt-3 leading-relaxed">
                            {installationAvailabilityError ===
                            "insufficient_capacity"
                              ? t(
                                  "map.availability.noCapacityDescription",
                                  "Hemos encontrado instalaciones cercanas, pero ninguna dispone ahora mismo de la potencia necesaria para cubrir la recomendación de tu estudio. Contacta con Sapiens para revisar tu caso.",
                                )
                              : t(
                                  "map.availability.noInstallationsDescription",
                                  "No hemos encontrado instalaciones activas dentro del radio configurado para esta dirección. Contacta con Sapiens para revisar tu caso.",
                                )}
                          </p>

                          <div className="mt-4 space-y-1 text-sm font-semibold text-brand-navy">
                            <p>
                              {t("map.contactPhone", "Teléfono")}: 960 99 27 77
                            </p>
                            <p>
                              {t("map.contactEmail", "Email")}:
                              info@sapiensenergia.es
                            </p>
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
                                {getInstallationModeLabel(inst.modalidad, t)}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-brand-gray flex items-center gap-2 mb-2">
                              <MapPin className="w-3 h-3" />
                              {inst.direccion}
                            </p>
                            {/*  */}
                            <div className="grid grid-cols-2 gap-3 mt-6">
                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold leading-none">
                                  <Icon
                                    icon="mdi:solar-panel-large"
                                    className="w-3.5 h-3.5 shrink-0"
                                  />
                                  <span>
                                    {t(
                                      "map.installationCard.solar",
                                      "Fotovoltaica",
                                    )}
                                  </span>
                                </div>

                                <p className="font-bold text-brand-navy">
                                  {formatNumber(inst.available_kwp ?? 0)} kWp
                                </p>
                              </div>

                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold leading-none">
                                  <Icon
                                    icon="mdi:battery-charging-medium"
                                    className="w-3.5 h-3.5 shrink-0"
                                  />
                                  <span>
                                    {t(
                                      "map.installationCard.storage",
                                      "Almacenamiento",
                                    )}
                                  </span>
                                </div>

                                <p className="font-bold text-brand-navy">
                                  {formatNumber(inst.almacenamiento_kwh)} kWh
                                </p>
                              </div>
                            </div>

                            <div className="mt-5 flex items-center gap-3 text-xs text-brand-gray">
                              <Building2 className="w-4 h-4" />
                              <span>
                                {t(
                                  "map.installationCard.effectiveHours",
                                  "{{value}} h efectivas",
                                  {
                                    value: formatNumber(inst.horas_efectivas),
                                  },
                                )}
                              </span>
                            </div>

                            <div className="mt-2 flex items-center gap-3 text-xs text-brand-gray">
                              <Icon
                                icon="solar:chart-bold-duotone"
                                className="w-4 h-4 text-brand-mint"
                              />
                              <span>
                                {t(
                                  "map.installationCard.reserved",
                                  "Reservados: {{value}} kWp",
                                  {
                                    value: formatNumber(inst.reserved_kwp ?? 0),
                                  },
                                )}
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
                    {t("calculation.titleLine1")} <br />
                    <span className="brand-gradient-text">
                      {t("calculation.titleLine2")}
                    </span>
                  </h2>

                  <p className="text-brand-gray mb-12 max-w-sm mx-auto">
                    Nuestros algoritmos están procesando miles de variables para
                    ofrecerte el mejor resultado.
                  </p>

                  <div className="space-y-4 max-w-xs w-full">
                    {[
                      t("calculation.tasks.validateBill"),
                      t("calculation.tasks.analyzeSolar"),
                      t("calculation.tasks.calculateReturn"),
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
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 md:space-y-8"
                >
                  {/* BLOQUE SUPERIOR */}
                  <div className="rounded-[2rem] md:rounded-[3rem] brand-gradient p-5 md:p-8 shadow-2xl shadow-brand-mint/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-56 h-56 md:w-80 md:h-80 bg-white/10 blur-3xl rounded-full -mr-20 -mt-20" />

                    <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_430px] gap-6">
                      {/* IZQUIERDA */}
                      <div className="space-y-5">
                        <div className="space-y-3">
                          <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-white/25 border border-white/20 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy">
                            <Icon
                              icon="solar:check-circle-bold-duotone"
                              className="h-4 w-4"
                            />
                            {t("result.badge")}
                          </div>

                          <div>
                            <h2 className="text-3xl md:text-5xl font-bold text-brand-navy leading-tight">
                              {t("result.hero.titleLine1")}
                              <br />
                              {t("result.hero.titleLine2")}{" "}
                            </h2>

                            <p className="mt-3 text-sm md:text-base text-brand-navy/70 max-w-2xl leading-relaxed">
                              {hasMultipleProposalModes
                                ? t("result.hero.compareDescription")
                                : activeProposal.id === "investment"
                                  ? t("result.hero.singleModeInvestment")
                                  : t("result.hero.singleModeService")}
                            </p>
                          </div>
                        </div>

                        {hasMultipleProposalModes ? (
                          <div className="inline-flex w-full rounded-[1.25rem] bg-white/35 p-1.5 backdrop-blur-xl border border-white/30 shadow-lg shadow-brand-navy/5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProposalView("investment")
                              }
                              className={cn(
                                "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                                activeProposalMode === "investment"
                                  ? "bg-brand-navy text-white shadow-md"
                                  : "text-brand-navy/70 hover:text-brand-navy",
                              )}
                            >
                              <Icon
                                icon="solar:wallet-money-bold-duotone"
                                className="h-5 w-5"
                              />
                              {t("result.modes.investment")}
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedProposalView("service")}
                              className={cn(
                                "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                                activeProposalMode === "service"
                                  ? "bg-brand-navy text-white shadow-md"
                                  : "text-brand-navy/70 hover:text-brand-navy",
                              )}
                            >
                              <Icon
                                icon="solar:bolt-bold-duotone"
                                className="h-5 w-5"
                              />
                              {t("result.modes.service")}{" "}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-[1.3rem] bg-white/35 backdrop-blur-xl border border-white/25 p-4 shadow-md shadow-brand-navy/5">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-brand-navy text-white flex items-center justify-center">
                                <Icon
                                  icon={
                                    activeProposal.id === "investment"
                                      ? "solar:wallet-money-bold-duotone"
                                      : "solar:bolt-bold-duotone"
                                  }
                                  className="h-5 w-5"
                                />
                              </div>

                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-navy/40">
                                  {t("result.availableMode")}
                                </p>
                                <p className="text-base md:text-lg font-bold text-brand-navy">
                                  {activeProposal.title}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="rounded-[1.6rem] bg-white/20 border border-white/20 backdrop-blur-xl p-4 md:p-5 shadow-lg shadow-brand-navy/5">
                          <div className="flex items-center gap-2 mb-4">
                            <Icon
                              icon={
                                activeProposal.id === "investment"
                                  ? "solar:wallet-money-bold-duotone"
                                  : "solar:bolt-bold-duotone"
                              }
                              className="h-5 w-5 text-brand-navy"
                            />
                            <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/45">
                              {t("result.activeOption")}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 md:gap-5">
                            <div className="rounded-[1.4rem] bg-white/35 border border-white/25 p-4">
                              <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/40">
                                {t("result.selectedMode")}{" "}
                              </p>
                              <p className="mt-2 text-2xl md:text-3xl font-bold text-brand-navy">
                                {activeProposal.title}
                              </p>
                              <p className="mt-3 text-sm text-brand-navy/65 leading-relaxed">
                                {activeProposal.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              {topActiveMetrics.map((item) => (
                                <div
                                  key={item.label}
                                  className="rounded-[1.2rem] bg-white/35 backdrop-blur-xl border border-white/25 p-3.5 shadow-md shadow-brand-navy/5"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Icon
                                      icon={item.icon}
                                      className="h-4 w-4 text-brand-navy/70"
                                    />
                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-navy/40">
                                      {item.label}
                                    </p>
                                  </div>

                                  <p className="text-sm md:text-lg font-bold text-brand-navy leading-tight">
                                    {item.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* DERECHA */}
                      <div className="space-y-4">
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45, ease: "easeOut" }}
                          className="relative overflow-hidden rounded-[1.9rem] border border-white/30 bg-white/26 p-6 text-[#000054] shadow-xl backdrop-blur-xl min-h-[210px]"
                        >
                          {/* brillo muy suave */}
                          <motion.div
                            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(84,217,199,0.14),transparent_30%)]"
                            animate={{ opacity: [0.75, 0.92, 0.75] }}
                            transition={{
                              duration: 4.5,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          />

                          {/* reflejo suave */}
                          <motion.div
                            className="pointer-events-none absolute -top-10 left-[-30%] h-[160%] w-16 rotate-[18deg] bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            animate={{ left: ["-30%", "115%"] }}
                            transition={{
                              duration: 4.8,
                              repeat: Infinity,
                              repeatDelay: 3.2,
                              ease: "easeInOut",
                            }}
                          />

                          <div className="relative z-10 h-full flex flex-col justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#94C2FF]/20">
                                <Icon
                                  icon={featuredResumeCard.icon}
                                  className="h-5 w-5 text-[#000054]"
                                />
                              </div>

                              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#706F6F]">
                                {featuredResumeCard.label}
                              </p>
                            </div>

                            <div className="mt-6">
                              <motion.p
                                animate={{ y: [0, -1.5, 0] }}
                                transition={{
                                  duration: 4,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                                className="text-4xl md:text-5xl font-bold leading-tight text-[#000054]"
                              >
                                {featuredResumeCard.value}
                              </motion.p>

                              {"helper" in featuredResumeCard &&
                              featuredResumeCard.helper ? (
                                <p className="mt-3 text-base text-[#706F6F]">
                                  {featuredResumeCard.helper}
                                </p>
                              ) : (
                                <p className="mt-3 text-base text-[#706F6F]">
                                  Estimado a largo plazo según la modalidad
                                  seleccionada.
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>

                        <motion.button
                          type="button"
                          onClick={handleGenerateContract}
                          disabled={
                            !savedStudy?.study?.id ||
                            isGeneratingContract ||
                            isSigningContract ||
                            contractAlreadySigned
                          }
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.45,
                            delay: 0.05,
                            ease: "easeOut",
                          }}
                          whileHover={
                            contractAlreadySigned
                              ? undefined
                              : { y: -1.5, scale: 1.008 }
                          }
                          whileTap={
                            contractAlreadySigned ? undefined : { scale: 0.992 }
                          }
                          className={cn(
                            "group relative w-full min-h-[210px] overflow-hidden rounded-[1.9rem] border p-6 text-left shadow-xl transition-all backdrop-blur-xl",
                            contractAlreadySigned
                              ? "cursor-not-allowed border-white/20 bg-white/20 opacity-70"
                              : "border-white/30 bg-[linear-gradient(135deg,rgba(84,217,199,0.88),rgba(148,194,255,0.88))] hover:shadow-[0_18px_45px_rgba(0,0,84,0.12)]",
                          )}
                        >
                          {!contractAlreadySigned ? (
                            <>
                              {/* respiración suave */}
                              <motion.div
                                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_35%)]"
                                animate={{ opacity: [0.82, 0.96, 0.82] }}
                                transition={{
                                  duration: 4.2,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />

                              {/* efecto espejo muy sutil */}
                              <motion.div
                                className="pointer-events-none absolute -top-10 left-[-32%] h-[180%] w-16 rotate-[18deg] bg-gradient-to-r from-transparent via-white/22 to-transparent"
                                animate={{ left: ["-32%", "118%"] }}
                                transition={{
                                  duration: 5.2,
                                  repeat: Infinity,
                                  repeatDelay: 3.5,
                                  ease: "easeInOut",
                                }}
                              />
                            </>
                          ) : null}

                          <div className="relative z-10 h-full flex flex-col justify-center items-center text-center">
                            <motion.div
                              animate={
                                contractAlreadySigned
                                  ? {}
                                  : {
                                      y: [0, -1.5, 0],
                                    }
                              }
                              transition={{
                                duration: 3.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                              className="mb-5 flex h-16 w-16 items-center justify-center rounded-[1.3rem] bg-[#000054] text-white shadow-[0_10px_28px_rgba(0,0,84,0.18)]"
                            >
                              {isGeneratingContract ? (
                                <Loader2 className="h-8 w-8 animate-spin" />
                              ) : contractAlreadySigned ? (
                                <Icon
                                  icon="solar:shield-check-bold-duotone"
                                  className="h-8 w-8"
                                />
                              ) : (
                                <Icon
                                  icon="solar:pen-new-square-bold-duotone"
                                  className="h-8 w-8"
                                />
                              )}
                            </motion.div>

                            <p className="text-3xl md:text-[2rem] font-bold text-[#000054]">
                              {reserveCardTitle}
                            </p>

                            <p className="mt-3 max-w-sm text-base leading-relaxed text-[#000054]/78">
                              {reserveCardDescription}
                            </p>

                            {!contractAlreadySigned ? (
                              <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[#000054]/10 bg-white/28 px-5 py-2 text-sm font-semibold text-[#000054]">
                                {`Continuar con ${activeModeLabelLower}`}
                                <motion.span
                                  animate={{ x: [0, 2, 0] }}
                                  transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                  }}
                                >
                                  →
                                </motion.span>
                              </div>
                            ) : null}
                          </div>
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* BLOQUE INFERIOR */}
                  <div
                    className={cn(
                      "grid gap-6 md:gap-8 items-stretch",
                      visibleProposalPanels.length === 2
                        ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]"
                        : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px]",
                    )}
                  >
                    {visibleProposalPanels.map((proposal) => {
                      const isInvestment = proposal.id === "investment";
                      const normalizedValuePoints = normalizeFeatureList(
                        proposal.valuePoints,
                        4,
                      );

                      return (
                        <div
                          key={proposal.id}
                          className={cn(
                            "rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-7 border min-h-[760px] h-full flex flex-col",
                            isInvestment
                              ? "bg-brand-navy text-white border-brand-navy shadow-2xl shadow-brand-navy/15"
                              : "bg-white text-brand-navy border-brand-navy/5 shadow-2xl shadow-brand-navy/5",
                          )}
                        >
                          <div className="space-y-4">
                            <div
                              className={cn(
                                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                                isInvestment
                                  ? "bg-white/10 text-white"
                                  : "bg-brand-mint/10 text-brand-navy",
                              )}
                            >
                              <Icon
                                icon={
                                  isInvestment
                                    ? "solar:wallet-money-bold-duotone"
                                    : "solar:bolt-bold-duotone"
                                }
                                className="h-4 w-4"
                              />
                              {t("result.cards.mode")}{" "}
                              {proposal.title.toLowerCase()}
                            </div>

                            <div>
                              <h3 className="text-3xl font-bold">
                                {proposal.title}
                              </h3>
                              <p
                                className={cn(
                                  "mt-2 text-sm leading-relaxed",
                                  isInvestment
                                    ? "text-white/75"
                                    : "text-brand-gray",
                                )}
                              >
                                {proposal.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-h-[132px]">
                              <div
                                className={cn(
                                  "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
                                  isInvestment
                                    ? "bg-white/10 border-white/10"
                                    : "bg-brand-navy/[0.03] border-brand-navy/5",
                                )}
                              >
                                <p
                                  className={cn(
                                    "text-[10px] uppercase tracking-[0.14em] font-bold",
                                    isInvestment
                                      ? "text-white/50"
                                      : "text-brand-navy/40",
                                  )}
                                >
                                  {t("result.summary.annualSavings")}
                                </p>
                                <p className="mt-2 text-lg font-bold">
                                  {formatCurrency(proposal.annualSavings)}
                                </p>
                              </div>

                              <div
                                className={cn(
                                  "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
                                  isInvestment
                                    ? "bg-white/10 border-white/10"
                                    : "bg-brand-navy/[0.03] border-brand-navy/5",
                                )}
                              >
                                <p
                                  className={cn(
                                    "text-[10px] uppercase tracking-[0.14em] font-bold",
                                    isInvestment
                                      ? "text-white/50"
                                      : "text-brand-navy/40",
                                  )}
                                >
                                  {isInvestment
                                    ? "Coste inicial"
                                    : "Cuota mensual"}
                                </p>
                                <p className="mt-2 text-lg font-bold">
                                  {isInvestment ? (
                                    formatCurrency(proposal.upfrontCost)
                                  ) : proposal.monthlyFee &&
                                    proposal.monthlyFee > 0 ? (
                                    <>
                                      {formatCurrency(proposal.monthlyFee)}
                                      <span className="ml-1 text-xs font-semibold opacity-70">
                                        / mes
                                      </span>
                                    </>
                                  ) : (
                                    "Sin cuota"
                                  )}
                                </p>
                              </div>

                              <div
                                className={cn(
                                  "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
                                  isInvestment
                                    ? "bg-white/10 border-white/10"
                                    : "bg-brand-navy/[0.03] border-brand-navy/5",
                                )}
                              >
                                <p
                                  className={cn(
                                    "text-[10px] uppercase tracking-[0.14em] font-bold",
                                    isInvestment
                                      ? "text-white/50"
                                      : "text-brand-navy/40",
                                  )}
                                >
                                  {t("result.summary.monthlySavings")}{" "}
                                </p>
                                <p className="mt-2 text-lg font-bold">
                                  {formatCurrency(proposal.annualSavings / 12)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 grid grid-rows-4 gap-3 min-h-[380px]">
                            {normalizedValuePoints.map((point, index) => (
                              <div
                                key={`${proposal.id}-${index}`}
                                className={cn(
                                  "rounded-[1.2rem] p-4 border h-[86px] flex items-center gap-3",
                                  point
                                    ? isInvestment
                                      ? "bg-white/5 border-white/10"
                                      : "bg-brand-navy/[0.03] border-brand-navy/5"
                                    : "bg-transparent border-transparent opacity-0 pointer-events-none",
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                    isInvestment
                                      ? "bg-white/10"
                                      : "brand-gradient shadow-md shadow-brand-mint/20",
                                  )}
                                >
                                  <Icon
                                    icon="solar:check-circle-bold-duotone"
                                    className={cn(
                                      "h-5 w-5",
                                      isInvestment
                                        ? "text-white"
                                        : "text-brand-navy",
                                    )}
                                  />
                                </div>

                                <p className="font-semibold text-sm md:text-base leading-snug">
                                  {point}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div
                            className={cn(
                              "mt-auto pt-6 text-sm",
                              isInvestment
                                ? "text-white/70"
                                : "text-brand-gray",
                            )}
                          >
                            <p>
                              {t("result.summary.recommendedPower")}::{" "}
                              <span className="font-bold">
                                {formatNumber(proposal.recommendedPowerKwp)} kWp
                              </span>
                            </p>
                            <p className="mt-1">
                              {t("result.summary.annualConsumptionEstimated")}:{" "}
                              <span className="font-bold">
                                {Math.round(proposal.annualConsumptionKwh)} kWh
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {/* ACCIONES */}
                    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 p-5 md:p-6 flex flex-col gap-5 xl:min-h-[520px]">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/40">
                          {t("result.actions.title")}
                        </p>
                      </div>

                      <div className="rounded-[1.4rem] bg-brand-navy text-white p-4 border border-brand-navy">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/50">
                          {t("result.actions.youWillHire")}
                        </p>

                        <p className="mt-3 text-2xl font-bold">
                          {activeProposal.title}
                        </p>

                        <div className="mt-4 space-y-2 text-sm text-white/75">
                          <p>
                            {t("result.actions.mode")}:{" "}
                            <span className="font-bold text-white">
                              {activeProposal.title}
                            </span>
                          </p>

                          <p>
                            {t("result.summary.annualSavings")}:{" "}
                            <span className="font-bold text-white">
                              {formatCurrency(activeProposal.annualSavings)}
                            </span>
                          </p>

                          <p>
                            {activeProposal.id === "investment" ? (
                              <>
                                {t("result.summary.initialCost")}:{" "}
                                <span className="font-bold text-white">
                                  {formatCurrency(activeProposal.upfrontCost)}
                                </span>
                              </>
                            ) : activeProposal.monthlyFee &&
                              activeProposal.monthlyFee > 0 ? (
                              <>
                                {t("result.summary.monthlyFee")}:{" "}
                                <span className="font-bold text-white">
                                  {formatNumber(activeProposal.monthlyFee)} € /{" "}
                                  {t("result.units.month")}
                                </span>
                              </>
                            ) : (
                              t("result.summary.noFee")
                            )}
                          </p>

                          <p>
                            {t("result.actions.power")}:{" "}
                            <span className="font-bold text-white">
                              {formatNumber(activeProposal.recommendedPowerKwp)}{" "}
                              kWp
                            </span>
                          </p>
                        </div>
                      </div>

                      {signedContractResult?.reservation ? (
                        <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
                          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/50">
                            {t("result.reserve.startedTitle")}
                          </p>

                          <div className="mt-3 space-y-2 text-sm leading-relaxed">
                            <p>
                              <span className="font-bold">
                                {signedContractResult.reservation.reservedKwp}{" "}
                                kWp
                              </span>{" "}
                              {t("result.actions.reservedIn")}{" "}
                              <span className="font-bold">
                                {
                                  signedContractResult.reservation
                                    .installationName
                                }
                              </span>
                              .
                            </p>

                            <p>
                              {t("result.actions.paymentStatus")}:{" "}
                              <span className="font-bold">
                                {signedContractResult.reservation.paymentStatus}
                              </span>
                            </p>

                            <p>
                              {t("result.actions.pendingSignal")}:{" "}
                              <span className="font-bold">
                                {formatCurrency(
                                  signedContractResult.reservation.signalAmount,
                                )}
                              </span>
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-auto space-y-3">
                        <Button
                          className={cn(
                            "w-full py-5 rounded-[1.2rem] border-none",
                            contractAlreadySigned
                              ? "bg-brand-navy/10 text-brand-navy/50 cursor-not-allowed"
                              : "bg-brand-mint text-brand-navy hover:bg-brand-mint/90",
                          )}
                          onClick={handleGenerateContract}
                          disabled={
                            !savedStudy?.study?.id ||
                            isGeneratingContract ||
                            isSigningContract ||
                            contractAlreadySigned
                          }
                        >
                          <span className="inline-flex items-center justify-center">
                            <span className="mr-3 inline-flex h-6 w-6 items-center justify-center">
                              {isGeneratingContract ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                              ) : contractAlreadySigned ? (
                                <Icon
                                  icon="solar:shield-check-bold-duotone"
                                  className="h-6 w-6"
                                />
                              ) : (
                                <Icon
                                  icon="solar:pen-new-square-bold-duotone"
                                  className="h-6 w-6"
                                />
                              )}
                            </span>
                            <span>{reserveButtonText}</span>
                          </span>
                        </Button>

                        <Button
                          className="w-full py-5 rounded-[1.2rem] brand-gradient text-brand-navy border-none"
                          onClick={handleDownloadPDF}
                        >
                          <Icon
                            icon="solar:download-minimalistic-bold-duotone"
                            className="mr-3 h-6 w-6"
                          />
                          {t("common.downloadPdf")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isContractModalOpen && generatedContract ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto"
          >
            <div className="min-h-full px-4 py-4 md:px-8 md:py-8 flex items-start md:items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-5xl rounded-[2rem] md:rounded-[2.5rem] bg-white border border-brand-navy/5 shadow-2xl overflow-hidden"
              >
                <div className="max-h-[calc(100vh-2rem)] md:max-h-[92vh] overflow-y-auto">
                  <div className="sticky top-0 z-20 px-5 md:px-8 py-5 border-b border-brand-navy/5 bg-white/95 backdrop-blur-md flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-1">
                        {t("contractFlow.modal.badge", "Contratación")}
                      </p>
                      <h3 className="text-xl md:text-2xl font-bold text-brand-navy">
                        {t(
                          "contractFlow.leftPanel.titleLine1",
                          "Revisa y firma",
                        )}{" "}
                        {t("contractFlow.leftPanel.titleLine2", "tu contrato")}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsContractModalOpen(false)}
                      className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition shrink-0"
                      aria-label={t("common.close", "Cerrar")}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="p-4 md:p-8 border-b lg:border-b-0 lg:border-r border-brand-navy/5">
                      <div className="rounded-[1.5rem] overflow-hidden border border-brand-navy/5 bg-brand-sky/5">
                        <iframe
                          title={t(
                            "contractFlow.iframe.title",
                            "Vista previa del contrato",
                          )}
                          srcDoc={generatedContract.previewHtml}
                          className="w-full h-[320px] sm:h-[420px] md:h-[560px] bg-white"
                        />
                      </div>
                    </div>

                    <div className="p-4 md:p-6 space-y-5 bg-brand-navy/[0.02]">
                      <div className="rounded-[1.4rem] bg-white border border-brand-navy/5 p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-2">
                          {t("contractFlow.contractCard.title", "Contrato")}
                        </p>
                        <p className="font-bold text-brand-navy">
                          {generatedContract.preview.contractNumber}
                        </p>
                        <p className="text-sm text-brand-gray mt-2">
                          {generatedContract.preview.client.nombre}{" "}
                          {generatedContract.preview.client.apellidos}
                        </p>
                        <p className="text-sm text-brand-gray">
                          {t("contractFlow.contractCard.dni", "DNI")}:{" "}
                          {generatedContract.preview.client.dni}
                        </p>
                      </div>

                      <div className="rounded-[1.4rem] bg-white border border-brand-navy/5 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40">
                            {t("contractFlow.signature.title", "Firma")}
                          </p>

                          <button
                            type="button"
                            onClick={clearSignature}
                            className="text-sm font-semibold text-brand-navy hover:text-brand-mint transition"
                          >
                            {t("contractFlow.signature.clear", "Limpiar")}
                          </button>
                        </div>

                        <canvas
                          ref={signatureCanvasRef}
                          width={600}
                          height={180}
                          className="w-full h-40 rounded-[1.2rem] border border-dashed border-brand-navy/20 bg-white touch-none"
                          onMouseDown={startSignatureDraw}
                          onMouseMove={moveSignatureDraw}
                          onMouseUp={endSignatureDraw}
                          onMouseLeave={endSignatureDraw}
                          onTouchStart={startSignatureDraw}
                          onTouchMove={moveSignatureDraw}
                          onTouchEnd={endSignatureDraw}
                        />

                        <p className="text-xs text-brand-gray mt-3 leading-relaxed">
                          {t(
                            "contractFlow.signature.help",
                            "Firma dentro del recuadro. Al confirmar, se generará el PDF firmado, se creará tu reserva provisional y podrás elegir la forma de pago.",
                          )}
                        </p>
                      </div>

                      <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon
                            icon="solar:bolt-bold-duotone"
                            className="h-5 w-5"
                          />
                          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/60">
                            {t(
                              "contractFlow.reservation.title",
                              "Reserva provisional",
                            )}
                          </p>
                        </div>

                        <p className="text-sm leading-relaxed">
                          {t(
                            "contractFlow.reservation.description",
                            "Al firmar, se reservarán {{assignedKwp}} kWp en la instalación seleccionada bajo la modalidad de {{modeLabel}}.",
                            {
                              assignedKwp:
                                generatedContract.preview.assignedKwp,
                              modeLabel: contractPreviewModeLabel,
                            },
                          )}
                        </p>
                      </div>

                      <div className="sticky bottom-0 bg-brand-navy/[0.02] pt-2">
                        <div className="space-y-3">
                          <Button
                            className="w-full py-5 rounded-[1.2rem] brand-gradient text-brand-navy border-none"
                            onClick={handleSubmitSignedContract}
                            disabled={isSigningContract}
                          >
                            {isSigningContract ? (
                              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                            ) : (
                              <Icon
                                icon="solar:shield-check-bold-duotone"
                                className="mr-3 h-5 w-5"
                              />
                            )}
                            {isSigningContract
                              ? t("contractFlow.actions.signing", "Firmando...")
                              : t(
                                  "contractFlow.actions.signAndContinue",
                                  "Firmar y continuar",
                                )}
                          </Button>

                          <Button
                            variant="outline"
                            className="w-full py-5 rounded-[1.2rem] border-brand-navy/10 text-brand-navy"
                            onClick={() => setIsContractModalOpen(false)}
                          >
                            {t("common.cancel", "Cancelar")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isPaymentMethodModalOpen && signedContractResult ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto"
          >
            <div className="min-h-full px-4 py-4 md:px-8 md:py-8 flex items-start md:items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-3xl rounded-[2rem] md:rounded-[2.5rem] bg-white border border-brand-navy/5 shadow-2xl overflow-hidden"
              >
                <div className="p-5 md:p-8 border-b border-brand-navy/5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-1">
                      {t("contractFlow.modal.badge", "Contratación")}
                    </p>
                    <h3 className="text-xl md:text-2xl font-bold text-brand-navy">
                      {t(
                        "contractFlow.modal.title",
                        "Selecciona la forma de pago",
                      )}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPaymentMethodModalOpen(false)}
                    className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition shrink-0"
                    disabled={isSelectingPaymentMethod}
                    aria-label={t("common.close", "Cerrar")}
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5 md:p-8 space-y-6 bg-brand-navy/[0.02]">
                  <div className="rounded-[1.4rem] bg-white border border-brand-navy/5 p-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-3">
                      {t(
                        "contractFlow.modal.reservationSummary",
                        "Resumen de la reserva",
                      )}
                    </p>

                    <div className="space-y-2 text-sm text-brand-navy/80">
                      <p>
                        <span className="font-bold text-brand-navy">
                          {t("contractFlow.modal.installation", "Instalación")}:
                        </span>{" "}
                        {signedContractResult.reservation.installationName}
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          {t(
                            "contractFlow.modal.reservedPower",
                            "Potencia reservada",
                          )}
                          :
                        </span>{" "}
                        {signedContractResult.reservation.reservedKwp} kWp
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          {t("contractFlow.modal.signal", "Señal")}:
                        </span>{" "}
                        {formatCurrency(
                          signedContractResult.reservation.signalAmount,
                        )}
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          {t("contractFlow.modal.deadline", "Fecha límite")}:
                        </span>{" "}
                        {new Date(
                          signedContractResult.reservation.paymentDeadlineAt,
                        ).toLocaleDateString(getDateLocale(currentAppLanguage))}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={handleSelectBankTransferPayment}
                      disabled={isSelectingPaymentMethod}
                      className="rounded-[1.5rem] border border-brand-navy/10 bg-white p-6 text-left shadow-sm hover:shadow-md transition disabled:opacity-60"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-brand-navy/5 flex items-center justify-center mb-4">
                        <Icon
                          icon="solar:card-transfer-bold-duotone"
                          className="h-6 w-6 text-brand-navy"
                        />
                      </div>

                      <p className="text-lg font-bold text-brand-navy">
                        {t(
                          "contractFlow.modal.bankTransferTitle",
                          "Transferencia bancaria",
                        )}
                      </p>
                      <p className="mt-2 text-sm text-brand-gray leading-relaxed">
                        {t(
                          "contractFlow.modal.bankTransferDescription",
                          "Recibirás un correo con el IBAN, el concepto y el PDF del precontrato firmado. Tendrás 15 días para realizar la transferencia.",
                        )}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectStripePayment}
                      disabled={isSelectingPaymentMethod}
                      className="rounded-[1.5rem] border border-brand-mint/20 bg-brand-mint/10 p-6 text-left shadow-sm hover:shadow-md transition disabled:opacity-60"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-brand-navy text-white flex items-center justify-center mb-4">
                        <Icon
                          icon="solar:card-send-bold-duotone"
                          className="h-6 w-6"
                        />
                      </div>

                      <p className="text-lg font-bold text-brand-navy">
                        {t(
                          "contractFlow.modal.stripeTitle",
                          "Tarjeta bancaria",
                        )}
                      </p>
                      <p className="mt-2 text-sm text-brand-gray leading-relaxed">
                        {t(
                          "contractFlow.modal.stripeDescription",
                          "Te redirigiremos a Stripe para completar el pago seguro de la señal con tarjeta.",
                        )}
                      </p>
                    </button>
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="w-full py-5 rounded-[1.2rem] border-brand-navy/10 text-brand-navy"
                      onClick={() => setIsPaymentMethodModalOpen(false)}
                      disabled={isSelectingPaymentMethod}
                    >
                      {isSelectingPaymentMethod ? (
                        <>
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          {t("common.processing", "Procesando...")}
                        </>
                      ) : (
                        t("common.close", "Cerrar")
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/contratacion" element={<ContinuarContratacionPage />} />

      <Route
        path="/continue-contract"
        element={<ContinuarContratacionPage />}
      />

      <Route
        path="/continuar-contratacion"
        element={<ContinuarContratacionPage />}
      />

      <Route
        path="/contratacion-desde-propuesta"
        element={<ContratacionDesdePropuestaPage />}
      />

      <Route
        path="/reserva-confirmada"
        element={<ReservationConfirmedPage />}
      />

      <Route
        path="/continuar-contratacion/exito"
        element={<ReservationConfirmedPage />}
      />

      <Route path="/reserva-cancelada" element={<ReservationCancelledPage />} />

      <Route
        path="/continuar-contratacion/cancelado"
        element={<ReservationCancelledPage />}
      />

      <Route path="*" element={<MainAppContent />} />
    </Routes>
  );
}
