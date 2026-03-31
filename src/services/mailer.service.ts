import nodemailer from "nodemailer";

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

type SendProposalEmailParams = {
  to: string;
  clientName: string;
  pdfBuffer: Buffer;
  pdfFilename?: string;
  proposalUrl?: string | null;
  continueContractUrl?: string | null;
};

export async function sendProposalEmail({
  to,
  clientName,
  pdfBuffer,
  pdfFilename = "propuesta.pdf",
  proposalUrl = null,
  continueContractUrl = null,
}: SendProposalEmailParams) {
  console.log("[mailer] to:", to);
  console.log("[mailer] from:", SMTP_FROM);
  console.log("[mailer] host:", SMTP_HOST);
  console.log("[mailer] port:", SMTP_PORT);
  console.log("[mailer] filename:", pdfFilename);
  console.log("[mailer] proposalUrl:", proposalUrl);
  console.log("[mailer] continueContractUrl:", continueContractUrl);
  console.log("[mailer] pdfBuffer length:", pdfBuffer?.length);

  const text = [
    `Hola ${clientName}, te adjuntamos tu propuesta energética personalizada en PDF.`,
    `Hemos preparado esta propuesta a partir de los datos de tu factura.`,
    proposalUrl ? `También puedes consultarla aquí: ${proposalUrl}` : "",
    continueContractUrl
      ? `Si deseas continuar con la contratación más adelante, puedes acceder desde este enlace seguro: ${continueContractUrl}`
      : "",
    `Si tienes cualquier duda, estaremos encantados de ayudarte.`,
    ``,
    `${SMTP_FROM_NAME}`,
  ]
    .filter(Boolean)
    .join("\n");

  const proposalLinkHtml = proposalUrl
    ? `
      <p style="margin: 0 0 16px 0;">
        También puedes consultar tu propuesta online aquí:<br />
        <a
          href="${proposalUrl}"
          target="_blank"
          style="color:#07005f; word-break: break-word;"
        >
          ${proposalUrl}
        </a>
      </p>
    `
    : "";

  const continueContractHtml = continueContractUrl
    ? `
      <div style="margin: 28px 0;">
        <p style="margin: 0 0 12px 0;">
          Si deseas continuar con la contratación más adelante, puedes hacerlo desde el siguiente acceso seguro:
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
          Continuar contratación
        </a>

        <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">
          Por seguridad, este enlace puede caducar.
        </p>
      </div>
    `
    : "";

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject: "Tu propuesta energética personalizada",
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 12px; color:#07005f;">Hola ${clientName},</h2>

        <p style="margin: 0 0 12px 0;">
          Te adjuntamos tu propuesta energética personalizada en PDF.
        </p>

        <p style="margin: 0 0 16px 0;">
          Hemos preparado esta propuesta a partir de los datos de tu factura.
        </p>

        ${proposalLinkHtml}

        ${continueContractHtml}

        <p style="margin: 24px 0 0 0;">
          Si tienes cualquier duda, estaremos encantados de ayudarte.
        </p>

        <br />

        <p style="margin: 0;">
          Un saludo,<br />
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
  } = params;

  const paymentDateFormatted = new Date(paymentDate).toLocaleString("es-ES");

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Reserva confirmada y pago recibido - ${contractNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color: #07005f; margin-bottom: 16px;">
          Reserva confirmada
        </h2>

        <p>Hola <strong>${clientName}</strong>,</p>

        <p>
          Hemos recibido correctamente el pago de tu señal y tu reserva ha quedado registrada.
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>Precontrato:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Instalación:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Potencia reservada:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0 0 8px 0;"><strong>Señal abonada:</strong> ${signalAmount} €</p>
          <p style="margin: 0;"><strong>Fecha de pago:</strong> ${paymentDateFormatted}</p>
        </div>

        <p>
          Te adjuntamos:
        </p>

        <ul>
          <li>Copia del precontrato firmado</li>
          <li>Justificante del pago realizado</li>
        </ul>

        <p>
          Gracias por confiar en Sapiens Energía.
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
}) {
  const formattedDate = new Date(params.paymentDeadlineAt).toLocaleDateString(
    "es-ES",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to: params.to,
    subject: "Tu contrato firmado y reserva provisional - Sapiens Energía",
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f;">Contrato firmado correctamente</h2>
        <p>Hola ${params.clientName},</p>
        <p>
          Adjuntamos una copia de tu contrato firmado.
        </p>
        <p>
          Hemos realizado una <strong>reserva provisional de ${params.reservedKwp} kWp</strong>
          en la planta <strong>${params.installationName}</strong>.
        </p>
        <p>
          Dispones de un plazo orientativo de <strong>15 días</strong>,
          hasta el <strong>${formattedDate}</strong>, para realizar la transferencia
          y confirmar la reserva.
        </p>
        ${
          params.contractUrl
            ? `<p>Puedes consultar también tu contrato aquí: <a href="${params.contractUrl}" target="_blank">${params.contractUrl}</a></p>`
            : ""
        }
        <p>Gracias por confiar en Sapiens Energía.</p>
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
  } = params;

  const formattedDeadline = new Date(paymentDeadlineAt).toLocaleDateString(
    "es-ES",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  const formattedAmount = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(signalAmount);

  const text = [
    `Hola ${clientName},`,
    ``,
    `Tu precontrato de reserva ya ha sido firmado correctamente.`,
    `Para completar la reserva, debes realizar la transferencia bancaria de la señal en un plazo máximo de 15 días, hasta el ${formattedDeadline}.`,
    ``,
    `Resumen de la operación:`,
    `- Precontrato: ${contractNumber}`,
    `- Instalación: ${installationName}`,
    `- Potencia reservada: ${reservedKwp} kWp`,
    `- Importe de la señal: ${formattedAmount}`,
    ``,
    `Datos bancarios para la transferencia:`,
    `- Beneficiario: ${bankBeneficiary}`,
    `- IBAN: ${bankAccountIban}`,
    `- Concepto: ${transferConcept}`,
    ``,
    `Te adjuntamos el PDF del precontrato firmado.`,
    ``,
    `${SMTP_FROM_NAME}`,
  ].join("\n");

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject: `Instrucciones de transferencia para tu reserva - ${contractNumber}`,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="color:#07005f; margin-bottom: 16px;">
          Reserva iniciada correctamente
        </h2>

        <p>Hola <strong>${clientName}</strong>,</p>

        <p>
          Tu precontrato de reserva ha sido firmado correctamente.
        </p>

        <p>
          Para completar la reserva, debes realizar la transferencia bancaria de la señal
          en un plazo máximo de <strong>15 días</strong>, hasta el
          <strong>${formattedDeadline}</strong>.
        </p>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
          <p style="margin: 0 0 8px 0;"><strong>Precontrato:</strong> ${contractNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Instalación:</strong> ${installationName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Potencia reservada:</strong> ${reservedKwp} kWp</p>
          <p style="margin: 0;"><strong>Importe de la señal:</strong> ${formattedAmount}</p>
        </div>

        <div style="margin: 20px 0; padding: 16px; border: 1px solid #dbeafe; border-radius: 12px; background: #eff6ff;">
          <p style="margin: 0 0 8px 0;"><strong>Beneficiario:</strong> ${bankBeneficiary}</p>
          <p style="margin: 0 0 8px 0;"><strong>IBAN:</strong> ${bankAccountIban}</p>
          <p style="margin: 0;"><strong>Concepto:</strong> ${transferConcept}</p>
        </div>

        <p>
          Te adjuntamos una copia del precontrato firmado en PDF.
        </p>

        <p>
          Una vez recibida y validada la transferencia, confirmaremos tu reserva.
        </p>

        <p style="margin-top: 24px;">
          Gracias por confiar en <strong>${SMTP_FROM_NAME}</strong>.
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