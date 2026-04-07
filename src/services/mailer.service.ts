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
  const dictionary = translationsByLanguage[language] ?? translationsByLanguage.es;
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

  const proposalUrlText = proposalUrl
    ? `\n${proposalUrl}`
    : "";

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

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: translate(
      lang,
      "emails.reservationConfirmed.subject",
      "Reserva confirmada y pago recibido - {{contractNumber}}",
      { contractNumber },
    ),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color: #07005f; margin-bottom: 16px;">
          ${translate(
            lang,
            "emails.reservationConfirmed.title",
            "Reserva confirmada",
          )}
        </h2>

        <p>${translate(
          lang,
          "emails.reservationConfirmed.greeting",
          "Hola <strong>{{clientName}}</strong>,",
          { clientName },
        )}</p>

        <p>
          ${translate(
            lang,
            "emails.reservationConfirmed.intro",
            "Hemos recibido correctamente el pago de tu señal y tu reserva ha quedado registrada.",
          )}
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.reservationConfirmed.labels.precontract", "Precontrato")}:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.reservationConfirmed.labels.installation", "Instalación")}:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.reservationConfirmed.labels.power", "Potencia reservada")}:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.reservationConfirmed.labels.amount", "Señal abonada")}:</strong> ${formattedAmount}</p>
          <p style="margin: 0;"><strong>${translate(lang, "emails.reservationConfirmed.labels.paymentDate", "Fecha de pago")}:</strong> ${paymentDateFormatted}</p>
        </div>

        <p>
          ${translate(
            lang,
            "emails.reservationConfirmed.attachmentsIntro",
            "Te adjuntamos:",
          )}
        </p>

        <ul>
          <li>${translate(
            lang,
            "emails.reservationConfirmed.attachments.precontract",
            "Copia del precontrato firmado",
          )}</li>
          <li>${translate(
            lang,
            "emails.reservationConfirmed.attachments.receipt",
            "Justificante del pago realizado",
          )}</li>
        </ul>

        <p>
          ${translate(
            lang,
            "emails.reservationConfirmed.thanks",
            "Gracias por confiar en Sapiens Energía.",
          )}
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

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to: params.to,
    subject: translate(
      lang,
      "emails.signedContract.subject",
      "Tu contrato firmado y reserva provisional - Sapiens Energía",
    ),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f;">
          ${translate(
            lang,
            "emails.signedContract.title",
            "Contrato firmado correctamente",
          )}
        </h2>

        <p>
          ${translate(
            lang,
            "emails.signedContract.greeting",
            "Hola {{clientName}},",
            { clientName: params.clientName },
          )}
        </p>

        <p>
          ${translate(
            lang,
            "emails.signedContract.contractAttached",
            "Adjuntamos una copia de tu contrato firmado.",
          )}
        </p>

        <p>
          ${translate(
            lang,
            "emails.signedContract.reservationText",
            "Hemos realizado una <strong>reserva provisional de {{reservedKwp}} kWp</strong> en la planta <strong>{{installationName}}</strong>.",
            {
              reservedKwp: params.reservedKwp,
              installationName: params.installationName,
            },
          )}
        </p>

        <p>
          ${translate(
            lang,
            "emails.signedContract.deadlineText",
            "Dispones de un plazo orientativo de <strong>15 días</strong>, hasta el <strong>{{formattedDate}}</strong>, para realizar la transferencia y confirmar la reserva.",
            { formattedDate },
          )}
        </p>

        ${
          params.contractUrl
            ? `<p>${translate(
                lang,
                "emails.signedContract.contractUrlText",
                'Puedes consultar también tu contrato aquí: <a href="{{contractUrl}}" target="_blank">{{contractUrl}}</a>',
                { contractUrl: params.contractUrl },
              )}</p>`
            : ""
        }

        <p>
          ${translate(
            lang,
            "emails.signedContract.thanks",
            "Gracias por confiar en Sapiens Energía.",
          )}
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

  const text = [
    translate(
      lang,
      "emails.bankTransfer.greeting",
      "Hola {{clientName}},",
      { clientName },
    ),
    "",
    translate(
      lang,
      "emails.bankTransfer.signedIntro",
      "Tu precontrato de reserva ya ha sido firmado correctamente.",
    ),
    translate(
      lang,
      "emails.bankTransfer.deadlineIntro",
      "Para completar la reserva, debes realizar la transferencia bancaria de la señal en un plazo máximo de 15 días, hasta el {{formattedDeadline}}.",
      { formattedDeadline },
    ),
    "",
    translate(
      lang,
      "emails.bankTransfer.summaryTitle",
      "Resumen de la operación:",
    ),
    `${translate(lang, "emails.bankTransfer.labels.precontract", "Precontrato")}: ${contractNumber}`,
    `${translate(lang, "emails.bankTransfer.labels.installation", "Instalación")}: ${installationName}`,
    `${translate(lang, "emails.bankTransfer.labels.power", "Potencia reservada")}: ${reservedKwp} kWp`,
    `${translate(lang, "emails.bankTransfer.labels.amount", "Importe de la señal")}: ${formattedAmount}`,
    "",
    translate(
      lang,
      "emails.bankTransfer.bankDataTitle",
      "Datos bancarios para la transferencia:",
    ),
    `${translate(lang, "emails.bankTransfer.labels.beneficiary", "Beneficiario")}: ${bankBeneficiary}`,
    `${translate(lang, "emails.bankTransfer.labels.iban", "IBAN")}: ${bankAccountIban}`,
    `${translate(lang, "emails.bankTransfer.labels.concept", "Concepto")}: ${transferConcept}`,
    "",
    translate(
      lang,
      "emails.bankTransfer.attachmentNotice",
      "Te adjuntamos el PDF del precontrato firmado.",
    ),
    "",
    `${SMTP_FROM_NAME}`,
  ].join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject: translate(
      lang,
      "emails.bankTransfer.subject",
      "Instrucciones de transferencia para tu reserva - {{contractNumber}}",
      { contractNumber },
    ),
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f; margin-bottom: 16px;">
          ${translate(
            lang,
            "emails.bankTransfer.title",
            "Reserva iniciada correctamente",
          )}
        </h2>

        <p>${translate(
          lang,
          "emails.bankTransfer.greeting",
          "Hola <strong>{{clientName}}</strong>,",
          { clientName },
        )}</p>

        <p>
          ${translate(
            lang,
            "emails.bankTransfer.signedIntro",
            "Tu precontrato de reserva ha sido firmado correctamente.",
          )}
        </p>

        <p>
          ${translate(
            lang,
            "emails.bankTransfer.deadlineHtml",
            "Para completar la reserva, debes realizar la transferencia bancaria de la señal en un plazo máximo de <strong>15 días</strong>, hasta el <strong>{{formattedDeadline}}</strong>.",
            { formattedDeadline },
          )}
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.bankTransfer.labels.precontract", "Precontrato")}:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.bankTransfer.labels.installation", "Instalación")}:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.bankTransfer.labels.power", "Potencia reservada")}:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0;"><strong>${translate(lang, "emails.bankTransfer.labels.amount", "Importe de la señal")}:</strong> ${formattedAmount}</p>
        </div>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #dbeafe; border-radius: 12px; background: #eff6ff;">
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.bankTransfer.labels.beneficiary", "Beneficiario")}:</strong> ${bankBeneficiary}</p>
          <p style="margin: 0 0 8px 0;"><strong>${translate(lang, "emails.bankTransfer.labels.iban", "IBAN")}:</strong> ${bankAccountIban}</p>
          <p style="margin: 0;"><strong>${translate(lang, "emails.bankTransfer.labels.concept", "Concepto")}:</strong> ${transferConcept}</p>
        </div>

        <p>
          ${translate(
            lang,
            "emails.bankTransfer.attachmentNotice",
            "Te adjuntamos una copia del precontrato firmado en PDF.",
          )}
        </p>

        <p>
          ${translate(
            lang,
            "emails.bankTransfer.confirmationNotice",
            "Una vez recibida y validada la transferencia, confirmaremos tu reserva.",
          )}
        </p>

        <p style="margin-top: 24px;">
          ${translate(
            lang,
            "emails.bankTransfer.thanks",
            "Gracias por confiar en <strong>{{companyName}}</strong>.",
            { companyName: SMTP_FROM_NAME },
          )}
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