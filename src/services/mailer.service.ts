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
};

export async function sendProposalEmail({
  to,
  clientName,
  pdfBuffer,
  pdfFilename = "propuesta.pdf",
  proposalUrl = null,
}: SendProposalEmailParams) {
  console.log("[mailer] to:", to);
  console.log("[mailer] from:", process.env.SMTP_FROM);
  console.log("[mailer] host:", process.env.SMTP_HOST);
  console.log("[mailer] port:", process.env.SMTP_PORT);
  console.log("[mailer] filename:", pdfFilename);
  console.log("[mailer] proposalUrl:", proposalUrl);
  console.log("[mailer] pdfBuffer length:", pdfBuffer?.length);
  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
    to,
    subject: "Tu propuesta energética personalizada",
    text: `Hola ${clientName}, te adjuntamos tu propuesta energética personalizada en PDF.${
      proposalUrl ? ` También puedes consultarla aquí: ${proposalUrl}` : ""
    }`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Hola ${clientName},</h2>
        <p>Te adjuntamos tu propuesta energética personalizada en PDF.</p>
        <p>Hemos preparado esta propuesta a partir de los datos de tu factura.</p>
        ${
          proposalUrl
            ? `<p>También puedes consultar tu propuesta online aquí:<br><a href="${proposalUrl}" target="_blank">${proposalUrl}</a></p>`
            : ""
        }
        <p>Si tienes cualquier duda, estaremos encantados de ayudarte.</p>
        <br />
        <p>Un saludo,<br><strong>${SMTP_FROM_NAME}</strong></p>
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
