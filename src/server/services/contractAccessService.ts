// // server/services/contractAccessService.ts
// import crypto from "node:crypto";
// import jwt from "jsonwebtoken";
// import { supabaseAdmin } from "../supabase"; // adapta la ruta

// const CONTRACT_RESUME_JWT_SECRET =
//   process.env.CONTRACT_RESUME_JWT_SECRET || "change-me";

// export function generatePlainToken(size = 32) {
//   return crypto.randomBytes(size).toString("base64url");
// }

// export function sha256(value: string) {
//   return crypto.createHash("sha256").update(value).digest("hex");
// }

// export function normalizeText(value: string) {
//   return (value || "")
//     .normalize("NFD")
//     .replace(/[\u0300-\u036f]/g, "")
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, " ");
// }

// export function normalizeDni(value: string) {
//   return (value || "").trim().toUpperCase().replace(/\s+/g, "");
// // }

// export async function createProposalContinueToken(params: {
//   studyId: string;
//   clientId: string;
//   expiresInHours?: number;
// }) {
//   const { studyId, clientId, expiresInHours = 24 * 15 } = params;

//   const plainToken = generatePlainToken(32);
//   const tokenHash = sha256(plainToken);

//   const expiresAt = new Date(
//     Date.now() + expiresInHours * 60 * 60 * 1000
//   ).toISOString();

//   const { error } = await supabaseAdmin
//     .from("contract_access_tokens")
//     .insert({
//       study_id: studyId,
//       client_id: clientId,
//       contract_id: null,
//       token_hash: tokenHash,
//       purpose: "proposal_continue",
//       expires_at: expiresAt,
//     });

//   if (error) {
//     throw new Error(
//       `No se pudo crear contract_access_token: ${error.message}`
//     );
//   }

//   return {
//     plainToken,
//     expiresAt,
//   };
// }

// export function signContractResumeToken(payload: {
//   studyId: string;
//   clientId: string;
//   installationId: string;
// }) {
//   return jwt.sign(payload, CONTRACT_RESUME_JWT_SECRET, {
//     expiresIn: "30m",
//   });
// }

// export function verifyContractResumeToken(token: string) {
//   return jwt.verify(token, CONTRACT_RESUME_JWT_SECRET) as {
//     studyId: string;
//     clientId: string;
//     installationId: string;
//     iat: number;
//     exp: number;
//   };
// }