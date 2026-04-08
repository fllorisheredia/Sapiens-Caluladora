import nodemailer from "nodemailer";
import esTranslations from "../i18n/locales/es/translation.json";
import caTranslations from "../i18n/locales/ca/translation.json";
import valTranslations from "../i18n/locales/val/translation.json";
import glTranslations from "../i18n/locales/gal/translation.json";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Sapiens Energía";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

type AppLanguage = "es" | "ca" | "val" | "gl";

const translationsByLanguage: Record<AppLanguage, any> = {
  es: esTranslations,
  ca: caTranslations,
  val: valTranslations,
  gl: glTranslations,
};

function normalizeAppLanguage(value: unknown): AppLanguage {
  const lang = String(value || "")
    .trim()
    .toLowerCase();

  if (lang === "ca") return "ca";
  if (lang === "val") return "val";
  if (lang === "gl" || lang === "gal") return "gl";
  return "es";
}

function getLanguageLocale(language: AppLanguage): string {
  if (language === "ca" || language === "val") return "ca-ES";
  if (language === "gl") return "gl-ES";
  return "es-ES";
}

function getNestedValue(obj: any, path: string): unknown {
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj);
}

function translate(
  language: AppLanguage,
  key: string,
  fallback: string,
  replacements?: Record<string, string | number>,
): string {
  const dictionary =
    translationsByLanguage[language] ?? translationsByLanguage.es;
  const raw = getNestedValue(dictionary, key);

  const base =
    typeof raw === "string" && raw.trim().length > 0 ? raw : fallback;

  return base.replace(/\{\{(\w+)\}\}/g, (_, token) => {
    const value = replacements?.[token];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

type SendProposalEmailParams = {
  to: string;
  clientName: string;
  pdfBuffer: Buffer;
  pdfFilename?: string;
  proposalUrl?: string | null;
  continueContractUrl?: string | null;
  language?: AppLanguage;
};

export async function sendProposalEmail({
  to,
  clientName,
  pdfBuffer,
  pdfFilename = "propuesta.pdf",
  proposalUrl = null,
  continueContractUrl = null,
  language = "es",
}: SendProposalEmailParams) {
  const lang = normalizeAppLanguage(language);

  console.log("[mailer] to:", to);
  console.log("[mailer] from:", SMTP_FROM);
  console.log("[mailer] host:", SMTP_HOST);
  console.log("[mailer] port:", SMTP_PORT);
  console.log("[mailer] filename:", pdfFilename);
  console.log("[mailer] proposalUrl:", proposalUrl);
  console.log("[mailer] continueContractUrl:", continueContractUrl);
  console.log("[mailer] language:", lang);
  console.log("[mailer] pdfBuffer length:", pdfBuffer?.length);

  const subject = translate(
    lang,
    "emails.proposal.subject",
    "Tu propuesta energética ya está disponible",
  );

  const greeting = translate(
    lang,
    "emails.proposal.greeting",
    "Hola {{clientName}},",
    { clientName },
  );

  const body1 = translate(
    lang,
    "emails.proposal.body1",
    "Te adjuntamos tu propuesta energética en PDF.",
  );

  const body2 = translate(
    lang,
    "emails.proposal.body2",
    "Hemos preparado esta propuesta a partir de los datos de tu factura.",
  );

  const continueText = translate(
    lang,
    "emails.proposal.continueText",
    "También puedes continuar el proceso desde el siguiente enlace seguro:",
  );

  const cta = translate(
    lang,
    "emails.proposal.cta",
    "Continuar contratación",
  );

  const securityNote = translate(
    lang,
    "emails.proposal.securityNote",
    "Por seguridad, este enlace puede caducar.",
  );

  const body3 = translate(
    lang,
    "emails.proposal.body3",
    "Si tienes cualquier duda, puedes responder directamente a este correo.",
  );

  const farewell = translate(
    lang,
    "emails.proposal.farewell",
    "Un saludo",
  );

  const proposalUrlText = proposalUrl ? `\n${proposalUrl}` : "";

  const continueContractText = continueContractUrl
    ? `${continueText}\n${continueContractUrl}`
    : "";

  const continueContractHtml = continueContractUrl
    ? `
      <div style="margin: 28px 0;">
        <p style="margin: 0 0 12px 0;">
          ${continueText}
        </p>

        <a
          href="${continueContractUrl}"
          target="_blank"
          style="
            display:inline-block;
            background:#07005f;
            color:#ffffff;
            text-decoration:none;
            padding:14px 22px;
            border-radius:12px;
            font-weight:700;
            font-size:14px;
          "
        >
          ${cta}
        </a>

        <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">
          ${securityNote}
        </p>
      </div>
    `
    : "";

  const text = [
    greeting,
    "",
    body1,
    body2,
    proposalUrlText,
    continueContractText,
    "",
    body3,
    "",
    farewell,
    SMTP_FROM_NAME,
  ]
    .filter(Boolean)
    .join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 12px; color:#07005f;">${greeting.replace(",", "")}</h2>

        <p style="margin: 0 0 12px 0;">
          ${body1}
        </p>

        <p style="margin: 0 0 16px 0;">
          ${body2}
        </p>

        ${continueContractHtml}

        <p style="margin: 24px 0 0 0;">
          ${body3}
        </p>

        <br />

        <p style="margin: 0;">
          ${farewell}<br />
          <strong>${SMTP_FROM_NAME}</strong>
        </p>
      </div>
    `,
    attachments: [
      {
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendReservationConfirmedEmail(params: {
  to: string;
  clientName: string;
  precontractPdfBuffer: Buffer;
  precontractPdfFilename: string;
  receiptPdfBuffer: Buffer;
  receiptPdfFilename: string;
  contractNumber: string;
  installationName: string;
  reservedKwp: number;
  signalAmount: number;
  paymentDate: string;
  language?: AppLanguage;
}) {
  const {
    to,
    clientName,
    precontractPdfBuffer,
    precontractPdfFilename,
    receiptPdfBuffer,
    receiptPdfFilename,
    contractNumber,
    installationName,
    reservedKwp,
    signalAmount,
    paymentDate,
    language = "es",
  } = params;

  const lang = normalizeAppLanguage(language);
  const locale = getLanguageLocale(lang);

  const paymentDateFormatted = new Date(paymentDate).toLocaleString(locale);

  const formattedAmount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(signalAmount);

  const subject = translate(
    lang,
    "emails.reservationConfirmed.subject",
    "Confirmación de tu reserva y justificante de pago",
  );

  const greeting = translate(
    lang,
    "emails.reservationConfirmed.greeting",
    "Hola {{clientName}},",
    { clientName },
  );

  const body1 = translate(
    lang,
    "emails.reservationConfirmed.body1",
    "Hemos confirmado correctamente tu reserva.",
  );

  const contractNumberLabel = translate(
    lang,
    "emails.reservationConfirmed.contractNumber",
    "Precontrato",
  );

  const installationLabel = translate(
    lang,
    "emails.reservationConfirmed.installation",
    "Instalación",
  );

  const reservedPowerLabel = translate(
    lang,
    "emails.reservationConfirmed.reservedPower",
    "Potencia reservada",
  );

  const signalAmountLabel = translate(
    lang,
    "emails.reservationConfirmed.signalAmount",
    "Señal abonada",
  );

  const paymentDateLabel = translate(
    lang,
    "emails.reservationConfirmed.paymentDate",
    "Fecha de pago",
  );

  const body2 = translate(
    lang,
    "emails.reservationConfirmed.body2",
    "Adjuntamos el precontrato y el justificante de pago para tu referencia.",
  );

  const body3 = translate(
    lang,
    "emails.reservationConfirmed.body3",
    "Gracias por confiar en nosotros.",
  );

  const farewell = translate(
    lang,
    "emails.reservationConfirmed.farewell",
    "Un saludo",
  );

  const text = [
    greeting,
    "",
    body1,
    "",
    `${contractNumberLabel}: ${contractNumber}`,
    `${installationLabel}: ${installationName}`,
    `${reservedPowerLabel}: ${reservedKwp} kWp`,
    `${signalAmountLabel}: ${formattedAmount}`,
    `${paymentDateLabel}: ${paymentDateFormatted}`,
    "",
    body2,
    body3,
    "",
    farewell,
    SMTP_FROM_NAME,
  ].join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f; margin-bottom: 16px;">
          ${subject}
        </h2>

        <p>${greeting}</p>

        <p>
          ${body1}
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>${contractNumberLabel}:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>${installationLabel}:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>${reservedPowerLabel}:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0 0 8px 0;"><strong>${signalAmountLabel}:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>${paymentDateLabel}:</strong> ${paymentDateFormatted}</p>
        </div>

        <p>
          ${body2}
        </p>

        <p>
          ${body3}
        </p>

        <p style="margin-top: 24px;">
          ${farewell}<br />
          <strong>${SMTP_FROM_NAME}</strong>
        </p>
      </div>
    `,
    attachments: [
      {
        filename: precontractPdfFilename,
        content: precontractPdfBuffer,
        contentType: "application/pdf",
      },
      {
        filename: receiptPdfFilename,
        content: receiptPdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendSignedContractEmail(params: {
  to: string;
  clientName: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  contractUrl?: string | null;
  installationName: string;
  reservedKwp: number;
  paymentDeadlineAt: string;
  language?: AppLanguage;
}) {
  const lang = normalizeAppLanguage(params.language);
  const locale = getLanguageLocale(lang);

  const formattedDate = new Date(params.paymentDeadlineAt).toLocaleDateString(
    locale,
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  const subject = translate(
    lang,
    "emails.signedContract.subject",
    "Tu contrato firmado y reserva provisional - Sapiens Energía",
  );

  const greeting = translate(
    lang,
    "emails.signedContract.greeting",
    "Hola {{clientName}},",
    { clientName: params.clientName },
  );

  const body1 = translate(
    lang,
    "emails.signedContract.body1",
    "Adjuntamos una copia de tu contrato firmado.",
  );

  const body2 = translate(
    lang,
    "emails.signedContract.body2",
    "Hemos realizado una reserva provisional de {{reservedKwp}} kWp en la planta {{installationName}}.",
    {
      reservedKwp: params.reservedKwp,
      installationName: params.installationName,
    },
  );

  const body3 = translate(
    lang,
    "emails.signedContract.body3",
    "Dispones de un plazo orientativo de 15 días, hasta el {{formattedDate}}, para realizar la transferencia y confirmar la reserva.",
    { formattedDate },
  );

  const contractLinkLabel = translate(
    lang,
    "emails.signedContract.contractLink",
    "Puedes consultar también tu contrato aquí:",
  );

  const farewell = translate(
    lang,
    "emails.signedContract.farewell",
    "Gracias por confiar en nosotros.",
  );

  const contractLinkText = params.contractUrl
    ? `${contractLinkLabel} ${params.contractUrl}`
    : "";

  const text = [
    greeting,
    "",
    body1,
    body2,
    body3,
    params.contractUrl ? "" : null,
    contractLinkText,
    "",
    farewell,
    SMTP_FROM_NAME,
  ]
    .filter(Boolean)
    .join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to: params.to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f; margin-bottom: 16px;">
          ${subject}
        </h2>

        <p>${greeting}</p>

        <p>${body1}</p>

        <p>${body2}</p>

        <p>${body3}</p>

        ${
          params.contractUrl
            ? `
              <p>
                ${contractLinkLabel}
                <a href="${params.contractUrl}" target="_blank">${params.contractUrl}</a>
              </p>
            `
            : ""
        }

        <p style="margin-top: 24px;">
          ${farewell}<br />
          <strong>${SMTP_FROM_NAME}</strong>
        </p>
      </div>
    `,
    attachments: [
      {
        filename: params.pdfFilename,
        content: params.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendBankTransferReservationEmail(params: {
  to: string;
  clientName: string;
  precontractPdfBuffer: Buffer;
  precontractPdfFilename: string;
  contractNumber: string;
  installationName: string;
  reservedKwp: number;
  signalAmount: number;
  currency: string;
  paymentDeadlineAt: string;
  bankAccountIban: string;
  bankBeneficiary: string;
  transferConcept: string;
  language?: AppLanguage;
}) {
  const {
    to,
    clientName,
    precontractPdfBuffer,
    precontractPdfFilename,
    contractNumber,
    installationName,
    reservedKwp,
    signalAmount,
    currency,
    paymentDeadlineAt,
    bankAccountIban,
    bankBeneficiary,
    transferConcept,
    language = "es",
  } = params;

  const lang = normalizeAppLanguage(language);
  const locale = getLanguageLocale(lang);

  const formattedDeadline = new Date(paymentDeadlineAt).toLocaleDateString(
    locale,
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  const formattedAmount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(signalAmount);

  const subject = translate(
    lang,
    "emails.bankTransfer.subject",
    "Instrucciones para completar tu reserva por transferencia",
  );

  const greeting = translate(
    lang,
    "emails.bankTransfer.greeting",
    "Hola {{clientName}},",
    { clientName },
  );

  const body1 = translate(
    lang,
    "emails.bankTransfer.body1",
    "Adjuntamos tu precontrato firmado y los datos para completar la reserva mediante transferencia bancaria.",
  );

  const contractNumberLabel = translate(
    lang,
    "emails.bankTransfer.contractNumber",
    "Precontrato",
  );

  const installationLabel = translate(
    lang,
    "emails.bankTransfer.installation",
    "Instalación",
  );

  const reservedPowerLabel = translate(
    lang,
    "emails.bankTransfer.reservedPower",
    "Potencia reservada",
  );

  const signalAmountLabel = translate(
    lang,
    "emails.bankTransfer.signalAmount",
    "Importe de la señal",
  );

  const deadlineLabel = translate(
    lang,
    "emails.bankTransfer.deadline",
    "Fecha límite",
  );

  const ibanLabel = translate(
    lang,
    "emails.bankTransfer.iban",
    "IBAN",
  );

  const beneficiaryLabel = translate(
    lang,
    "emails.bankTransfer.beneficiary",
    "Beneficiario",
  );

  const conceptLabel = translate(
    lang,
    "emails.bankTransfer.concept",
    "Concepto",
  );

  const body2 = translate(
    lang,
    "emails.bankTransfer.body2",
    "Es importante que indiques exactamente el concepto en la transferencia para poder identificar el pago correctamente.",
  );

  const body3 = translate(
    lang,
    "emails.bankTransfer.body3",
    "Una vez recibido y validado el pago, te enviaremos la confirmación por correo electrónico.",
  );

  const farewell = translate(
    lang,
    "emails.bankTransfer.farewell",
    "Un saludo",
  );

  const text = [
    greeting,
    "",
    body1,
    "",
    `${contractNumberLabel}: ${contractNumber}`,
    `${installationLabel}: ${installationName}`,
    `${reservedPowerLabel}: ${reservedKwp} kWp`,
    `${signalAmountLabel}: ${formattedAmount}`,
    `${deadlineLabel}: ${formattedDeadline}`,
    "",
    `${beneficiaryLabel}: ${bankBeneficiary}`,
    `${ibanLabel}: ${bankAccountIban}`,
    `${conceptLabel}: ${transferConcept}`,
    "",
    body2,
    body3,
    "",
    farewell,
    SMTP_FROM_NAME,
  ].join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f; margin-bottom: 16px;">
          ${subject}
        </h2>

        <p>${greeting}</p>

        <p>
          ${body1}
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>${contractNumberLabel}:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>${installationLabel}:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>${reservedPowerLabel}:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0 0 8px 0;"><strong>${signalAmountLabel}:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>${deadlineLabel}:</strong> ${formattedDeadline}</p>
        </div>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #dbeafe; border-radius: 12px; background: #eff6ff;">
          <p style="margin: 0 0 8px 0;"><strong>${beneficiaryLabel}:</strong> ${bankBeneficiary}</p>
          <p style="margin: 0 0 8px 0;"><strong>${ibanLabel}:</strong> ${bankAccountIban}</p>
          <p style="margin: 0;"><strong>${conceptLabel}:</strong> ${transferConcept}</p>
        </div>

        <p>
          ${body2}
        </p>

        <p>
          ${body3}
        </p>

        <p style="margin-top: 24px;">
          ${farewell}<br />
          <strong>${SMTP_FROM_NAME}</strong>
        </p>
      </div>
    `,
    attachments: [
      {
        filename: precontractPdfFilename,
        content: precontractPdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}