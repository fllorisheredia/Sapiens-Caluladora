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