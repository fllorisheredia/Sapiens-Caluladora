import emailjs from "@emailjs/browser";
import type { BillData } from "../../lib/validators";
import type { CalculationResult } from "../calculation/energyService";
import { generateStudyPDF } from "../pdf/pdfService";
// import {generateStudyPDF}

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim() || "";
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim() || "";
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim() || "";

export interface SendStudyByEmailParams {
  to: string;
  customerName: string;
  attachment?: Blob;
  billData: BillData;
  calculationResult: CalculationResult;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, decimals = 2) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function assertEmailJsConfig() {
  if (!SERVICE_ID) throw new Error("Falta VITE_EMAILJS_SERVICE_ID");
  if (!TEMPLATE_ID) throw new Error("Falta VITE_EMAILJS_TEMPLATE_ID");
  if (!PUBLIC_KEY) throw new Error("Falta VITE_EMAILJS_PUBLIC_KEY");
  if (SERVICE_ID === TEMPLATE_ID) {
    throw new Error("El TEMPLATE_ID no puede ser igual al SERVICE_ID");
  }
}

function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result); // Devuelve la cadena Base64
      } else {
        reject(new Error("No se pudo convertir el PDF a Base64"));
      }
    };

    reader.onerror = () => reject(new Error("Error leyendo el PDF"));
    reader.readAsDataURL(blob); // Convierte el Blob en Base64
  });
}

export async function sendStudyByEmail({
  to,
  customerName,
  attachment,
  billData,
  calculationResult,
}: SendStudyByEmailParams): Promise<void> {
  assertEmailJsConfig();

  if (!to?.trim()) {
    throw new Error("No se ha indicado un email de destino válido");
  }

  let pdfAttachment = "";

  // Si no hay un archivo adjunto, generamos el PDF usando los datos.
  if (!attachment) {
    // Verificar que el flujo llega aquí
    console.log("Generando PDF...");

    // Generamos el PDF usando la función ya existente en pdfService
    const generatedPdf = generateStudyPDF(billData, calculationResult);

    // Verificamos que generatedPdf tenga el objeto jsPDF
    console.log("PDF generado:", generatedPdf);

    // Convertimos el PDF a un Blob usando el método output de jsPDF
    const pdfBlob = generatedPdf.output("blob");

    // Verificamos si el Blob es válido
    console.log("PDF convertido a Blob:", pdfBlob);

    // Ahora pasamos el Blob a Base64
    pdfAttachment = await blobToBase64DataUrl(pdfBlob);

    // Verificar la conversión a Base64
    console.log("PDF convertido a Base64:", pdfAttachment);
  } else {
    // Si ya tenemos un archivo adjunto, lo convertimos a base64
    pdfAttachment = await blobToBase64DataUrl(attachment);
  }

  const templateParams = {
    to_email: to.trim(),
    customer_name: customerName?.trim() || billData.name || "Cliente",
    subject: `Tu estudio energético personalizado - ${customerName || "Cliente"}`,
    message: `
    Hola ${customerName || "Cliente"},
    
    Ya hemos generado tu estudio energético personalizado y te adjuntamos la propuesta en PDF.

    Resumen del estudio:
    - Consumo mensual: ${formatNumber(billData.monthlyConsumption || 0)} kWh
    - Consumo anual estimado: ${formatNumber(calculationResult.annualConsumptionKwh || 0)} kWh
    - Potencia recomendada: ${formatNumber(calculationResult.recommendedPowerKwp || 0)} kWp
    - Inversión estimada: ${formatCurrency(calculationResult.investmentCost || 0)}
    - Ahorro anual estimado: ${formatCurrency(calculationResult.annualSavingsInvestment || 0)}

    Gracias por confiar en nosotros.
  `.trim(),
    pdf_attachment: pdfAttachment, // Aquí pasa el archivo PDF convertido a Base64
  };

  console.log("EMAILJS CONFIG", {
    SERVICE_ID,
    TEMPLATE_ID,
    PUBLIC_KEY,
  });

  console.log("EMAILJS PARAMS", {
    ...templateParams,
    pdf_attachment: pdfAttachment ? "[BASE64_PDF_GENERATED]" : "[EMPTY]",
  });

  // Enviar el correo con EmailJS
  const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, {
    publicKey: PUBLIC_KEY,
  });

  if (response.status !== 200) {
    throw new Error(
      `EmailJS devolvió un estado inesperado: ${response.status}`,
    );
  }
}
