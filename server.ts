import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
// import dotenv from "dotenv";

import "dotenv/config";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { extractInvoiceWithFallback } from "./src/services/invoiceExtractionOrchestrator";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { sendProposalEmail } from "./src/services/mailer.service";
// dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SAPIENS_CONTACT_PHONE = process.env.SAPIENS_CONTACT_PHONE || "960000000";
const SAPIENS_CONTACT_EMAIL =
  process.env.SAPIENS_CONTACT_EMAIL || "info@sapiensenergia.com";

const GOOGLE_MAPS_GEOCODING_API_KEY =
  process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "";

if (!GOOGLE_MAPS_GEOCODING_API_KEY) {
  throw new Error("Falta GOOGLE_MAPS_GEOCODING_API_KEY en .env");
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";

const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(
  /\\n/g,
  "\n",
);

const GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";

if (
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_PRIVATE_KEY ||
  !GOOGLE_DRIVE_ROOT_FOLDER_ID
) {
  throw new Error(
    "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_DRIVE_ROOT_FOLDER_ID en .env",
  );
}

function normalizeDriveToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildClientFolderName(
  dni: string,
  nombre: string,
  apellidos: string,
): string {
  return `${normalizeDriveToken(dni)}-${normalizeDriveToken(
    nombre,
  )}_${normalizeDriveToken(apellidos)}`;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getStudyCoordinates(study: any): { lat: number; lng: number } | null {
  const lat =
    toNullableNumber(study?.location?.lat) ??
    toNullableNumber(study?.location?.latitude) ??
    toNullableNumber(study?.customer?.lat) ??
    toNullableNumber(study?.customer?.latitude) ??
    toNullableNumber(study?.invoice_data?.lat) ??
    toNullableNumber(study?.invoice_data?.latitude);

  const lng =
    toNullableNumber(study?.location?.lng) ??
    toNullableNumber(study?.location?.lon) ??
    toNullableNumber(study?.location?.longitude) ??
    toNullableNumber(study?.customer?.lng) ??
    toNullableNumber(study?.customer?.lon) ??
    toNullableNumber(study?.customer?.longitude) ??
    toNullableNumber(study?.invoice_data?.lng) ??
    toNullableNumber(study?.invoice_data?.lon) ??
    toNullableNumber(study?.invoice_data?.longitude);

  if (lat === null || lng === null) return null;

  return { lat, lng };
}

type InstallationWithAvailability = {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  active: boolean;
  potencia_instalada_kwp: number;
  distance_meters: number;
  totalKwp: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;
};

type FindEligibleInstallationsResult = {
  study: any;
  coords: { lat: number; lng: number };
  withinRange: InstallationWithAvailability[];
  eligible: InstallationWithAvailability[];
  recommended: InstallationWithAvailability | null;
  reason: "no_installations_in_range" | "no_capacity_in_range" | null;
};
async function findEligibleInstallationsForStudy(params: {
  studyId: string;
  assignedKwp: number;
  radiusMeters?: number;
}): Promise<FindEligibleInstallationsResult> {
  const radiusMeters = params.radiusMeters ?? 2000;

  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", params.studyId)
    .single();

  if (studyError || !study) {
    throw new Error("El estudio no existe");
  }

  const coords = getStudyCoordinates(study);

  if (!coords) {
    throw new Error(
      "El estudio no tiene coordenadas válidas para buscar instalaciones cercanas",
    );
  }

  const { data: installations, error: installationsError } = await supabase
    .from("installations")
    .select("*")
    .eq("active", true)
    .order("nombre_instalacion", { ascending: true });

  if (installationsError) {
    throw new Error(
      `No se pudieron obtener las instalaciones: ${installationsError.message}`,
    );
  }

  const withinRange = (installations ?? [])
    .map((installation) => {
      const distance_meters = haversineDistanceMeters(
        coords.lat,
        coords.lng,
        Number(installation.lat),
        Number(installation.lng),
      );

      return {
        ...installation,
        distance_meters,
      };
    })
    .filter((installation) => installation.distance_meters <= radiusMeters)
    .sort((a, b) => a.distance_meters - b.distance_meters);

  if (withinRange.length === 0) {
    return {
      study,
      coords,
      withinRange: [],
      eligible: [],
      recommended: null,
      reason: "no_installations_in_range" as const,
    };
  }

  const installationIds = withinRange.map((item) => item.id);

  const { data: relatedStudies, error: relatedStudiesError } = await supabase
    .from("studies")
    .select("id, selected_installation_id, assigned_kwp")
    .in("selected_installation_id", installationIds)
    .neq("id", params.studyId);

  if (relatedStudiesError) {
    throw new Error(
      `No se pudo calcular la ocupación actual: ${relatedStudiesError.message}`,
    );
  }

  const usedByInstallation = new Map<string, number>();

  for (const row of relatedStudies ?? []) {
    const installationId = String((row as any).selected_installation_id ?? "");
    const assigned = Number((row as any).assigned_kwp ?? 0);

    if (!installationId) continue;

    usedByInstallation.set(
      installationId,
      (usedByInstallation.get(installationId) ?? 0) + assigned,
    );
  }

  const eligible: InstallationWithAvailability[] = withinRange
    .map((installation) => {
      const totalKwp = Number(installation.potencia_instalada_kwp ?? 0);
      const usedKwp = usedByInstallation.get(String(installation.id)) ?? 0;
      const availableKwp = Math.max(totalKwp - usedKwp, 0);
      const occupancyPercent =
        totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

      return {
        ...installation,
        totalKwp,
        usedKwp,
        availableKwp,
        occupancyPercent,
      };
    })
    .filter((installation) => installation.availableKwp >= params.assignedKwp)
    .sort((a, b) => {
      if (a.distance_meters !== b.distance_meters) {
        return a.distance_meters - b.distance_meters;
      }

      return a.occupancyPercent - b.occupancyPercent;
    });

  return {
    study,
    coords,
    withinRange,
    eligible,
    recommended: eligible[0] ?? null,
    reason:
      eligible.length === 0
        ? ("no_capacity_in_range" as const)
        : (null as null),
  };
}
function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }
  return false;
}

function parseMaybeJson<T = any>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
function toPositiveNumber(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return parsed > 0 ? parsed : null;
}

async function getInstallationCapacityState(params: {
  installationId: string;
  excludeStudyId?: string;
}) {
  const { installationId, excludeStudyId } = params;

  const { data: installation, error: installationError } = await supabase
    .from("installations")
    .select("id, nombre_instalacion, potencia_instalada_kwp, active")
    .eq("id", installationId)
    .single();

  if (installationError || !installation) {
    throw new Error("La instalación no existe");
  }

  if (!installation.active) {
    throw new Error("La instalación está inactiva");
  }

  let query = supabase
    .from("studies")
    .select("id, assigned_kwp")
    .eq("selected_installation_id", installationId);

  if (excludeStudyId) {
    query = query.neq("id", excludeStudyId);
  }

  const { data: relatedStudies, error: relatedStudiesError } = await query;

  if (relatedStudiesError) {
    throw new Error(
      `No se pudo calcular la ocupación de la instalación: ${relatedStudiesError.message}`,
    );
  }

  const usedKwp = (relatedStudies ?? []).reduce((acc, study) => {
    return acc + Number((study as any).assigned_kwp ?? 0);
  }, 0);

  const totalKwp = Number(installation.potencia_instalada_kwp ?? 0);
  const availableKwp = Math.max(totalKwp - usedKwp, 0);
  const occupancyPercent =
    totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

  return {
    installation,
    totalKwp,
    usedKwp,
    availableKwp,
    occupancyPercent,
  };
}

async function validateInstallationAssignment(params: {
  installationId: string;
  assignedKwp: number;
  excludeStudyId?: string;
}) {
  const state = await getInstallationCapacityState({
    installationId: params.installationId,
    excludeStudyId: params.excludeStudyId,
  });

  const nextUsedKwp = state.usedKwp + params.assignedKwp;

  if (nextUsedKwp > state.totalKwp) {
    const availableKwp = Math.max(state.totalKwp - state.usedKwp, 0);

    throw new Error(
      `No hay capacidad suficiente en la instalación. Disponibles: ${availableKwp.toFixed(
        2,
      )} kWp`,
    );
  }

  return {
    ...state,
    assignedKwp: params.assignedKwp,
    nextUsedKwp,
    nextAvailableKwp: Math.max(state.totalKwp - nextUsedKwp, 0),
    nextOccupancyPercent:
      state.totalKwp > 0
        ? Number(((nextUsedKwp / state.totalKwp) * 100).toFixed(2))
        : 0,
  };
}

async function downloadDriveFileAsBuffer(fileId: string) {
  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );

  const fileData = response.data;

  let buffer: Buffer;

  if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else if (fileData instanceof ArrayBuffer) {
    buffer = Buffer.from(fileData);
  } else if (typeof fileData === "string") {
    buffer = Buffer.from(fileData);
  } else {
    buffer = Buffer.from(fileData as any);
  }

  return {
    buffer,
    fileName: metadata.data.name ?? "propuesta.pdf",
    mimeType: metadata.data.mimeType ?? "application/pdf",
  };
}

function buildInstallationSnapshot(params: {
  installation: {
    id: string;
    nombre_instalacion: string;
    potencia_instalada_kwp: number;
    active?: boolean;
  };
  assignedKwp: number;
  totalKwp: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;
}) {
  return {
    installationId: params.installation.id,
    installationName: params.installation.nombre_instalacion,
    installationData: {
      id: params.installation.id,
      nombre_instalacion: params.installation.nombre_instalacion,
      potencia_instalada_kwp: params.totalKwp,
      active: params.installation.active ?? true,
    },
    assigned_kwp: params.assignedKwp,
    occupancy: {
      total_kwp: params.totalKwp,
      used_kwp: params.usedKwp,
      available_kwp: params.availableKwp,
      occupancy_percent: params.occupancyPercent,
    },
    updated_at: new Date().toISOString(),
  };
}

function getPeriodPrice(
  reqBody: any,
  invoiceData: any,
  period: "p1" | "p2" | "p3" | "p4" | "p5" | "p6",
): number | null {
  return (
    toNullableNumber(reqBody?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.prices?.[period]) ??
    toNullableNumber(invoiceData?.energy_prices?.[period]) ??
    toNullableNumber(invoiceData?.period_prices?.[period]) ??
    toNullableNumber(invoiceData?.coste_eur_kwh?.[period]) ??
    null
  );
}

async function ensureClientDriveFolder(params: {
  dni: string;
  nombre: string;
  apellidos: string;
}) {
  const folderName = buildClientFolderName(
    params.dni,
    params.nombre,
    params.apellidos,
  );

  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ??
        `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error("No se pudo crear la carpeta del cliente en Drive");
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

async function uploadBufferToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const uploaded = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: "id,name,webViewLink,webContentLink",
    supportsAllDrives: true,
  });

  if (!uploaded.data.id) {
    throw new Error("No se pudo subir el archivo a Google Drive");
  }

  return {
    id: uploaded.data.id,
    name: uploaded.data.name ?? params.fileName,
    webViewLink:
      uploaded.data.webViewLink ??
      `https://drive.google.com/file/d/${uploaded.data.id}/view`,
    webContentLink: uploaded.data.webContentLink ?? null,
  };
}

const driveAuth = new google.auth.JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({
  version: "v3",
  auth: driveAuth,
});

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

async function geocodeAddressWithGoogle(address: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string | null;
  placeId: string | null;
} | null> {
  const normalizedAddress = normalizeAddressForGeocoding(address);

  if (!normalizedAddress) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", normalizedAddress);
  url.searchParams.set("region", "es");
  url.searchParams.set("key", GOOGLE_MAPS_GEOCODING_API_KEY);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("No se pudo geocodificar la dirección con Google");
  }

  const json = await response.json();

  if (
    json.status !== "OK" ||
    !Array.isArray(json.results) ||
    json.results.length === 0
  ) {
    return null;
  }

  const first = json.results[0];
  const lat = Number(first?.geometry?.location?.lat);
  const lng = Number(first?.geometry?.location?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    formattedAddress: first?.formatted_address ?? null,
    placeId: first?.place_id ?? null,
  };
}

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  // app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use("/assets", express.static(path.join(process.cwd(), "src", "assets")));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });

  // =========================
  // HEALTH
  // =========================

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // =========================
  // EXTRACTION API
  // =========================

  app.post("/api/extract-bill", upload.single("file"), async (req, res) => {
    try {
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({
          error: "No se ha recibido ningún archivo",
        });
      }

      const allowedMimeTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
        return res.status(400).json({
          error: "Tipo de archivo no soportado",
          details: `MIME recibido: ${uploadedFile.mimetype}`,
        });
      }

      const result = await extractInvoiceWithFallback({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        fileName: uploadedFile.originalname,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Error en /api/extract-bill:", error);

      return res.status(500).json({
        error: "No se pudo extraer la información de la factura",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post(
    "/api/confirm-study",
    upload.fields([
      { name: "invoice", maxCount: 1 },
      { name: "proposal", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const files =
          (req.files as {
            [fieldname: string]: Express.Multer.File[];
          }) || {};

        const invoiceFile = files.invoice?.[0] || files.file?.[0] || null;
        const proposalFile = files.proposal?.[0] || null;

        const customer = parseMaybeJson<any>(req.body.customer) ?? {};
        const location = parseMaybeJson<any>(req.body.location);
        const invoiceData = parseMaybeJson<any>(req.body.invoice_data) ?? {};
        const calculation = parseMaybeJson<any>(req.body.calculation);
        const selectedInstallationSnapshot = parseMaybeJson<any>(
          req.body.selected_installation_snapshot,
        );
        const sourceFile = parseMaybeJson<any>(req.body.source_file);
        const rawAddress =
          pickFirstString(
            req.body.direccion_completa,
            customer?.direccion_completa,
            customer?.address,
            invoiceData?.direccion_completa,
            invoiceData?.address,
            location?.address,
          ) ?? "";

        const geocoded = rawAddress
          ? await geocodeAddressWithGoogle(rawAddress)
          : null;

        const nombre =
          pickFirstString(
            req.body.nombre,
            customer?.nombre,
            customer?.name,
            customer?.firstName,
          ) ?? "";

        const apellidos =
          pickFirstString(
            req.body.apellidos,
            customer?.apellidos,
            customer?.lastName,
            customer?.surnames,
          ) ?? "";

        const dni =
          pickFirstString(
            req.body.dni,
            customer?.dni,
            customer?.documentNumber,
            invoiceData?.dni,
            invoiceData?.nif,
          ) ?? "";

        const cups = pickFirstString(
          req.body.cups,
          customer?.cups,
          invoiceData?.cups,
        );

        const direccionCompleta = pickFirstString(
          req.body.direccion_completa,
          customer?.direccion_completa,
          customer?.address,
          invoiceData?.direccion_completa,
          invoiceData?.address,
          location?.address,
        );

        const iban = pickFirstString(
          req.body.iban,
          customer?.iban,
          invoiceData?.iban,
        );
        const email =
          pickFirstString(
            req.body.email,
            customer?.email,
            customer?.correo,
            customer?.mail,
            invoiceData?.email,
            invoiceData?.correo,
          ) ?? null;

        const telefono =
          pickFirstString(
            req.body.telefono,
            req.body.phone,
            customer?.telefono,
            customer?.phone,
            customer?.mobile,
            customer?.movil,
            invoiceData?.telefono,
            invoiceData?.phone,
          ) ?? null;

        const codigo_postal =
          pickFirstString(
            req.body.codigo_postal,
            req.body.codigoPostal,
            req.body.postal_code,
            customer?.codigo_postal,
            customer?.codigoPostal,
            customer?.postalCode,
            invoiceData?.codigo_postal,
            invoiceData?.codigoPostal,
            invoiceData?.postalCode,
            location?.codigo_postal,
            location?.codigoPostal,
            location?.postalCode,
          ) ?? null;

        const poblacion =
          pickFirstString(
            req.body.poblacion,
            req.body.ciudad,
            req.body.localidad,
            req.body.city,
            customer?.poblacion,
            customer?.ciudad,
            customer?.localidad,
            customer?.city,
            invoiceData?.poblacion,
            invoiceData?.ciudad,
            invoiceData?.localidad,
            invoiceData?.city,
            location?.poblacion,
            location?.ciudad,
            location?.localidad,
            location?.city,
          ) ?? null;

        const provincia =
          pickFirstString(
            req.body.provincia,
            req.body.state,
            customer?.provincia,
            customer?.state,
            invoiceData?.provincia,
            invoiceData?.state,
            location?.provincia,
            location?.state,
          ) ?? null;

        const pais =
          pickFirstString(
            req.body.pais,
            req.body.country,
            customer?.pais,
            customer?.country,
            invoiceData?.pais,
            invoiceData?.country,
            location?.pais,
            location?.country,
          ) ?? "España";

        const tipoFacturaRaw = (
          pickFirstString(
            req.body.tipo_factura,
            customer?.tipo_factura,
            invoiceData?.tipo_factura,
            invoiceData?.billType,
            invoiceData?.tariffType,
          ) || "2TD"
        ).toUpperCase();

        const locationPayload = {
          ...(location ?? {}),
          address: rawAddress || location?.address || null,
          direccion_completa:
            (direccionCompleta ?? rawAddress) || location?.address || null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          lat: geocoded?.lat ?? location?.lat ?? null,
          lng: geocoded?.lng ?? location?.lng ?? null,
          formatted_address: geocoded?.formattedAddress ?? null,
          place_id: geocoded?.placeId ?? null,
        };

        const tipo_factura = tipoFacturaRaw === "3TD" ? "3TD" : "2TD";

        if (!nombre || !apellidos || !dni) {
          return res.status(400).json({
            error: "Faltan nombre, apellidos o DNI para confirmar el estudio",
          });
        }

        const consumo_mensual_real_kwh =
          toNullableNumber(req.body.consumo_mensual_real_kwh) ??
          toNullableNumber(customer?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.monthly_real_consumption_kwh) ??
          null;

        const consumo_medio_mensual_kwh =
          toNullableNumber(req.body.consumo_medio_mensual_kwh) ??
          toNullableNumber(customer?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.monthly_average_consumption_kwh) ??
          null;

        const precio_p1_eur_kwh = getPeriodPrice(req.body, invoiceData, "p1");
        const precio_p2_eur_kwh = getPeriodPrice(req.body, invoiceData, "p2");
        const precio_p3_eur_kwh = getPeriodPrice(req.body, invoiceData, "p3");
        const precio_p4_eur_kwh = getPeriodPrice(req.body, invoiceData, "p4");
        const precio_p5_eur_kwh = getPeriodPrice(req.body, invoiceData, "p5");
        const precio_p6_eur_kwh = getPeriodPrice(req.body, invoiceData, "p6");

        const folder = await ensureClientDriveFolder({
          dni,
          nombre,
          apellidos,
        });

        let uploadedInvoice: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        let uploadedProposal: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        if (invoiceFile) {
          const extension =
            invoiceFile.originalname.split(".").pop()?.toLowerCase() || "pdf";

          uploadedInvoice = await uploadBufferToDrive({
            folderId: folder.id,
            fileName: `FACTURA_${normalizeDriveToken(dni)}.${extension}`,
            mimeType: invoiceFile.mimetype,
            buffer: invoiceFile.buffer,
          });
        }

        if (proposalFile) {
          uploadedProposal = await uploadBufferToDrive({
            folderId: folder.id,
            fileName: `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
            mimeType: proposalFile.mimetype || "application/pdf",
            buffer: proposalFile.buffer,
          });
        }
        const normalizedCustomer = {
          ...(customer ?? {}),
          nombre,
          apellidos,
          dni,
          email,
          telefono,
          cups: cups ?? null,
          direccion_completa: direccionCompleta ?? null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          iban: iban ?? null,
        };
        const clientPayload = {
          nombre,
          apellidos,
          dni,
          email,
          telefono,
          cups: cups ?? null,
          direccion_completa: direccionCompleta ?? null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          iban: iban ?? null,
          consumo_mensual_real_kwh,
          consumo_medio_mensual_kwh,
          precio_p1_eur_kwh,
          precio_p2_eur_kwh,
          precio_p3_eur_kwh,
          precio_p4_eur_kwh,
          precio_p5_eur_kwh,
          precio_p6_eur_kwh,
          tipo_factura,
          drive_folder_id: folder.id,
          drive_folder_url: folder.webViewLink,
          factura_drive_file_id: uploadedInvoice?.id ?? null,
          factura_drive_url: uploadedInvoice?.webViewLink ?? null,
          propuesta_drive_file_id: uploadedProposal?.id ?? null,
          propuesta_drive_url: uploadedProposal?.webViewLink ?? null,
          datos_adicionales: normalizedCustomer,
        };

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .upsert(clientPayload, { onConflict: "dni" })
          .select()
          .single();

        if (clientError) {
          console.error("Error guardando cliente:", clientError);
          return res.status(500).json({
            error: "Error saving client",
            details: clientError.message,
          });
        }

        const assignedKwp = toPositiveNumber(
          req.body.assignedKwp ?? req.body.assigned_kwp,
        );

        const studyInsert = {
          language: req.body.language ?? "ES",
          consent_accepted: toBoolean(req.body.consent_accepted),
          source_file: {
            ...(sourceFile ?? {}),
            original_name: invoiceFile?.originalname ?? null,
            mime_type: invoiceFile?.mimetype ?? null,
            drive_folder_id: folder.id,
            drive_folder_url: folder.webViewLink,
            invoice_drive_file_id: uploadedInvoice?.id ?? null,
            invoice_drive_url: uploadedInvoice?.webViewLink ?? null,
            proposal_drive_file_id: uploadedProposal?.id ?? null,
            proposal_drive_url: uploadedProposal?.webViewLink ?? null,
          },
          customer: normalizedCustomer,
          location: locationPayload,
          invoice_data: invoiceData ?? null,
          selected_installation_id: req.body.selected_installation_id ?? null,
          assigned_kwp: assignedKwp ?? null,
          selected_installation_snapshot: selectedInstallationSnapshot ?? null,
          calculation: calculation ?? null,
          status: req.body.status ?? "uploaded",
          // email_status: req.body.email_status ?? "pending",
          email_status: "pending",
        };

        const { data: studyData, error: studyError } = await supabase
          .from("studies")
          .insert([studyInsert])
          .select()
          .single();

        if (studyError) {
          console.error("Error creando estudio confirmado:", studyError);
          return res.status(500).json({
            error: "Error saving confirmed study",
            details: studyError.message,
          });
        }

        let emailStatus: "pending" | "sent" | "failed" = "pending";
        let emailError: string | null = null;

        console.log("[confirm-study] email:", email);
        console.log("[confirm-study] proposalFile existe:", !!proposalFile);
        console.log(
          "[confirm-study] proposalFile originalname:",
          proposalFile?.originalname,
        );
        console.log("[confirm-study] uploadedProposal:", uploadedProposal);

        if (!email) {
          emailStatus = "failed";
          emailError = "No se encontró email del cliente";
        } else if (!proposalFile) {
          emailStatus = "failed";
          emailError = "No se recibió el PDF de la propuesta";
        } else {
          try {
            await sendProposalEmail({
              to: email,
              clientName: `${nombre} ${apellidos}`.trim(),
              pdfBuffer: proposalFile.buffer,
              pdfFilename:
                proposalFile.originalname ||
                `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
              proposalUrl: uploadedProposal?.webViewLink ?? null,
            });

            emailStatus = "sent";
          } catch (error: any) {
            console.error(
              "Error enviando email automático de propuesta:",
              error,
            );
            emailStatus = "failed";
            emailError =
              error?.message || "Error desconocido al enviar el correo";
          }

          console.log("[confirm-study] emailStatus final:", emailStatus);
          console.log("[confirm-study] emailError final:", emailError);
        }

        const { data: updatedStudy, error: updateStudyError } = await supabase
          .from("studies")
          .update({
            email_status: emailStatus,
          })
          .eq("id", studyData.id)
          .select()
          .single();

        if (updateStudyError) {
          console.error(
            "Error actualizando email_status del estudio:",
            updateStudyError,
          );
        }

        return res.status(201).json({
          success: true,
          client: clientData,
          study: updatedStudy ?? studyData,
          drive: {
            folderId: folder.id,
            folderUrl: folder.webViewLink,
            invoiceUrl: uploadedInvoice?.webViewLink ?? null,
            proposalUrl: uploadedProposal?.webViewLink ?? null,
          },
          email: {
            to: email,
            status: emailStatus,
            error: emailError,
          },
        });
      } catch (error: any) {
        console.error("Error en /api/confirm-study:", error);
        return res.status(500).json({
          error: "No se pudo confirmar el estudio",
          details: error?.message || "Error desconocido",
        });
      }
    },
  );

  app.post("/api/studies/:id/send-proposal-email", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: study, error: studyError } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .single();

      if (studyError || !study) {
        return res.status(404).json({
          error: "Study not found",
          details: studyError?.message ?? "El estudio no existe",
        });
      }

      const customer = study.customer ?? {};
      const sourceFile = study.source_file ?? {};

      const email =
        pickFirstString(
          req.body?.email,
          customer?.email,
          customer?.correo,
          customer?.mail,
        ) ?? null;

      const nombre =
        pickFirstString(customer?.nombre, customer?.name, "Cliente") ??
        "Cliente";

      const apellidos =
        pickFirstString(
          customer?.apellidos,
          customer?.lastName,
          customer?.surnames,
        ) ?? "";

      const proposalDriveFileId =
        pickFirstString(
          sourceFile?.proposal_drive_file_id,
          sourceFile?.propuesta_drive_file_id,
        ) ?? null;

      const proposalUrl =
        pickFirstString(
          sourceFile?.proposal_drive_url,
          sourceFile?.propuesta_drive_url,
        ) ?? null;

      if (!email) {
        return res.status(400).json({
          error: "No se encontró el email del cliente",
        });
      }

      if (!proposalDriveFileId) {
        return res.status(400).json({
          error: "No se encontró el PDF de propuesta en Drive",
        });
      }

      const driveProposal =
        await downloadDriveFileAsBuffer(proposalDriveFileId);

      await sendProposalEmail({
        to: email,
        clientName: `${nombre} ${apellidos}`.trim(),
        pdfBuffer: driveProposal.buffer,
        pdfFilename: driveProposal.fileName,
        proposalUrl,
      });

      const { data: updatedStudy } = await supabase
        .from("studies")
        .update({
          email_status: "sent",
        })
        .eq("id", id)
        .select()
        .single();

      return res.json({
        success: true,
        message: "Correo reenviado correctamente",
        study: updatedStudy ?? study,
        email: {
          to: email,
          status: "sent",
        },
      });
    } catch (error: any) {
      console.error("Error en /api/studies/:id/send-proposal-email:", error);

      return res.status(500).json({
        error: "No se pudo reenviar el correo",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post("/api/geocode-address", async (req, res) => {
    try {
      const address = String(req.body?.address || "").trim();

      if (!address) {
        return res.status(400).json({
          error: "La dirección es obligatoria",
        });
      }

      const geocoded = await geocodeAddressWithGoogle(address);

      if (!geocoded) {
        return res.status(404).json({
          error: "No se pudo geocodificar la dirección",
        });
      }

      return res.json({
        success: true,
        coords: {
          lat: geocoded.lat,
          lng: geocoded.lng,
        },
        formattedAddress: geocoded.formattedAddress,
        placeId: geocoded.placeId,
      });
    } catch (error: any) {
      console.error("Error en /api/geocode-address:", error);
      return res.status(500).json({
        error: "No se pudo geocodificar la dirección",
        details: error?.message || "Error desconocido",
      });
    }
  });

  // =========================
  // STUDIES API
  // =========================

  app.post("/api/studies/:id/auto-assign-installation", async (req, res) => {
    try {
      const { id } = req.params;

      const assignedKwp = toPositiveNumber(
        req.body.assignedKwp ??
          req.body.assigned_kwp ??
          req.body?.calculation?.assigned_kwp ??
          req.body?.calculation?.required_kwp,
      );

      if (assignedKwp === null) {
        return res.status(400).json({
          error: "assignedKwp debe ser un número mayor que 0",
        });
      }

      const result = await findEligibleInstallationsForStudy({
        studyId: id,
        assignedKwp,
        radiusMeters: 2000,
      });

      if (result.reason === "no_installations_in_range") {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_installations_in_range",
          message:
            "No hay instalaciones disponibles en un radio de 2 km. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
        });
      }

      if (result.reason === "no_capacity_in_range") {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_capacity_in_range",
          message:
            "Hay instalaciones cercanas, pero ahora mismo no tienen capacidad disponible. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
          nearby_installations: result.withinRange.map((item) => ({
            id: item.id,
            nombre_instalacion: item.nombre_instalacion,
            distance_meters: item.distance_meters,
          })),
        });
      }

      if (!result.recommended) {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_capacity_in_range",
          message:
            "Hay instalaciones cercanas, pero ahora mismo no tienen capacidad disponible. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
        });
      }

      const recommended = result.recommended;

      const nextUsedKwp = recommended.usedKwp + assignedKwp;
      const nextAvailableKwp = Math.max(recommended.totalKwp - nextUsedKwp, 0);
      const nextOccupancyPercent =
        recommended.totalKwp > 0
          ? Number(((nextUsedKwp / recommended.totalKwp) * 100).toFixed(2))
          : 0;

      const snapshot = {
        installationId: recommended.id,
        installationName: recommended.nombre_instalacion,
        installationData: {
          id: recommended.id,
          nombre_instalacion: recommended.nombre_instalacion,
          direccion: recommended.direccion,
          lat: recommended.lat,
          lng: recommended.lng,
          potencia_instalada_kwp: recommended.totalKwp,
          active: recommended.active,
        },
        assigned_kwp: assignedKwp,
        occupancy: {
          total_kwp: recommended.totalKwp,
          used_kwp: nextUsedKwp,
          available_kwp: nextAvailableKwp,
          occupancy_percent: nextOccupancyPercent,
        },
        distance_meters: recommended.distance_meters,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedStudy, error: updateError } = await supabase
        .from("studies")
        .update({
          selected_installation_id: recommended.id,
          assigned_kwp: assignedKwp,
          selected_installation_snapshot: snapshot,
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: "Error actualizando el estudio",
          details: updateError.message,
        });
      }

      return res.json({
        success: true,
        assignable: true,
        study: updatedStudy,
        installation: {
          id: recommended.id,
          nombre_instalacion: recommended.nombre_instalacion,
          distance_meters: recommended.distance_meters,
          totalKwp: recommended.totalKwp,
          usedKwp: nextUsedKwp,
          availableKwp: nextAvailableKwp,
          occupancyPercent: nextOccupancyPercent,
        },
      });
    } catch (error: any) {
      console.error(
        "Error en /api/studies/:id/auto-assign-installation:",
        error,
      );
      return res.status(500).json({
        error: "No se pudo autoasignar la instalación",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post("/api/studies", async (req, res) => {
    try {
      const payload = req.body;
      const assignedKwp = toPositiveNumber(
        payload.assignedKwp ?? payload.assigned_kwp,
      );

      const { data, error } = await supabase
        .from("studies")
        .insert([
          {
            language: payload.language ?? "ES",
            consent_accepted: payload.consent_accepted ?? false,
            source_file: payload.source_file ?? null,
            customer: payload.customer ?? null,
            location: payload.location ?? null,
            invoice_data: payload.invoice_data ?? null,
            selected_installation_id: payload.selected_installation_id ?? null,
            assigned_kwp: assignedKwp ?? null,
            selected_installation_snapshot:
              payload.selected_installation_snapshot ?? null,
            calculation: payload.calculation ?? null,
            status: payload.status ?? "uploaded",
            email_status: payload.email_status ?? "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creando estudio:", error);
        return res.status(500).json({
          error: "Error saving study",
          details: error.message,
        });
      }

      res.status(201).json(data);
    } catch (error: any) {
      console.error("Error inesperado creando estudio:", error);
      res.status(500).json({
        error: "Error saving study",
        details: error.message,
      });
    }
  });

  app.get("/api/studies", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error obteniendo estudios:", error);
        return res.status(500).json({
          error: "Error fetching studies",
          details: error.message,
        });
      }

      res.json(data ?? []);
    } catch (error: any) {
      console.error("Error inesperado obteniendo estudios:", error);
      res.status(500).json({
        error: "Error fetching studies",
        details: error.message,
      });
    }
  });

  app.get("/api/studies/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error obteniendo estudio:", error);
        return res.status(404).json({
          error: "Study not found",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado obteniendo estudio:", error);
      res.status(500).json({
        error: "Error fetching study",
        details: error.message,
      });
    }
  });

  app.put("/api/studies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      if (
        payload.selected_installation_id !== undefined ||
        payload.selectedInstallationId !== undefined ||
        payload.assigned_kwp !== undefined ||
        payload.assignedKwp !== undefined
      ) {
        return res.status(400).json({
          error:
            "Para asignar instalación o potencia usa PATCH /api/studies/:id/assign-installation",
        });
      }

      const { data, error } = await supabase
        .from("studies")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error actualizando estudio:", error);
        return res.status(500).json({
          error: "Error updating study",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado actualizando estudio:", error);
      res.status(500).json({
        error: "Error updating study",
        details: error.message,
      });
    }
  });

  app.patch("/api/studies/:id/assign-installation", async (req, res) => {
    try {
      const { id } = req.params;

      const installationId =
        pickFirstString(
          req.body.installationId,
          req.body.selected_installation_id,
          req.body.selectedInstallationId,
        ) ?? null;

      const assignedKwp = toPositiveNumber(
        req.body.assignedKwp ?? req.body.assigned_kwp,
      );

      if (!installationId) {
        return res.status(400).json({
          error: "La instalación es obligatoria",
        });
      }

      if (assignedKwp === null) {
        return res.status(400).json({
          error: "assignedKwp debe ser un número mayor que 0",
        });
      }

      const { data: existingStudy, error: existingStudyError } = await supabase
        .from("studies")
        .select("id, selected_installation_id, assigned_kwp")
        .eq("id", id)
        .single();

      if (existingStudyError || !existingStudy) {
        return res.status(404).json({
          error: "Study not found",
          details: existingStudyError?.message ?? "El estudio no existe",
        });
      }

      const capacity = await validateInstallationAssignment({
        installationId,
        assignedKwp,
        excludeStudyId: id,
      });

      const snapshot = buildInstallationSnapshot({
        installation: {
          id: capacity.installation.id,
          nombre_instalacion: capacity.installation.nombre_instalacion,
          potencia_instalada_kwp: capacity.totalKwp,
          active: capacity.installation.active,
        },
        assignedKwp,
        totalKwp: capacity.totalKwp,
        usedKwp: capacity.nextUsedKwp,
        availableKwp: capacity.nextAvailableKwp,
        occupancyPercent: capacity.nextOccupancyPercent,
      });

      const { data: updatedStudy, error: updateError } = await supabase
        .from("studies")
        .update({
          selected_installation_id: installationId,
          assigned_kwp: assignedKwp,
          selected_installation_snapshot: snapshot,
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: "Error updating study installation",
          details: updateError.message,
        });
      }

      return res.json({
        success: true,
        study: updatedStudy,
        installation: {
          id: capacity.installation.id,
          nombre_instalacion: capacity.installation.nombre_instalacion,
          totalKwp: capacity.totalKwp,
          usedKwp: capacity.nextUsedKwp,
          availableKwp: capacity.nextAvailableKwp,
          occupancyPercent: capacity.nextOccupancyPercent,
        },
      });
    } catch (error: any) {
      console.error("Error en /api/studies/:id/assign-installation:", error);
      return res.status(400).json({
        error: "No se pudo asignar la instalación",
        details: error?.message || "Error desconocido",
      });
    }
  });

  //SENDMAIL
  // server.ts
  // app.post("/api/send-proposal-email", async (req, res) => {
  //   try {
  //     const { to, clientName, studyData } = req.body;

  //     // 1. Generar PDF
  //     const pdfBuffer = await generateStudyPDFBuffer(studyData);

  //     // 2. Enviar email
  //     await sendProposalEmail({
  //       to,
  //       clientName,
  //       pdfBuffer,
  //     });

  //     res.status(200).json({
  //       ok: true,
  //       message: "Correo enviado correctamente",
  //     });
  //   } catch (error) {
  //     console.error("Error enviando correo:", error);
  //     res.status(500).json({
  //       ok: false,
  //       message: "No se pudo enviar el correo",
  //     });
  //   }
  // });

  // =========================
  // INSTALLATIONS API
  // =========================

  app.get("/api/installations", async (req, res) => {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : null;
      const lng = req.query.lng ? Number(req.query.lng) : null;
      const radius = req.query.radius ? Number(req.query.radius) : 2000;

      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("active", true)
        .order("nombre_instalacion", { ascending: true });

      if (error) {
        console.error("Error obteniendo instalaciones:", error);
        return res.status(500).json({
          error: "Error fetching installations",
          details: error.message,
        });
      }

      let installations = data ?? [];

      if (lat !== null && lng !== null) {
        installations = installations
          .map((installation) => {
            const distance_meters = haversineDistanceMeters(
              lat,
              lng,
              installation.lat,
              installation.lng,
            );

            return {
              ...installation,
              distance_meters,
            };
          })
          .filter((installation) => installation.distance_meters <= radius)
          .sort((a, b) => a.distance_meters - b.distance_meters);
      }

      res.json(installations);
    } catch (error: any) {
      console.error("Error inesperado obteniendo instalaciones:", error);
      res.status(500).json({
        error: "Error fetching installations",
        details: error.message,
      });
    }
  });

  app.post("/api/installations", async (req, res) => {
    try {
      const payload = req.body;

      const { data, error } = await supabase
        .from("installations")
        .insert([
          {
            nombre_instalacion: payload.nombre_instalacion,
            direccion: payload.direccion,
            lat: payload.lat,
            lng: payload.lng,
            horas_efectivas: payload.horas_efectivas,
            potencia_instalada_kwp: payload.potencia_instalada_kwp,
            almacenamiento_kwh: payload.almacenamiento_kwh,
            coste_anual_mantenimiento_por_kwp:
              payload.coste_anual_mantenimiento_por_kwp,
            coste_kwh_inversion: payload.coste_kwh_inversion,
            coste_kwh_servicio: payload.coste_kwh_servicio,
            porcentaje_autoconsumo: payload.porcentaje_autoconsumo,
            modalidad: payload.modalidad,
            active: payload.active ?? true,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creando instalación:", error);
        return res.status(500).json({
          error: "Error saving installation",
          details: error.message,
        });
      }

      res.status(201).json(data);
    } catch (error: any) {
      console.error("Error inesperado creando instalación:", error);
      res.status(500).json({
        error: "Error saving installation",
        details: error.message,
      });
    }
  });

  app.put("/api/installations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      const { data, error } = await supabase
        .from("installations")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error actualizando instalación:", error);
        return res.status(500).json({
          error: "Error updating installation",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado actualizando instalación:", error);
      res.status(500).json({
        error: "Error updating installation",
        details: error.message,
      });
    }
  });

  app.delete("/api/installations/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from("installations")
        .update({ active: false })
        .eq("id", id);

      if (error) {
        console.error("Error desactivando instalación:", error);
        return res.status(500).json({
          error: "Error deleting installation",
          details: error.message,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error inesperado desactivando instalación:", error);
      res.status(500).json({
        error: "Error deleting installation",
        details: error.message,
      });
    }
  });

  app.post("/api/geocode-address", async (req, res) => {
    try {
      const address = String(req.body?.address || "").trim();

      if (!address) {
        return res.status(400).json({
          error: "La dirección es obligatoria",
        });
      }

      const geocoded = await geocodeAddressWithGoogle(address);

      if (!geocoded) {
        return res.status(404).json({
          error: "No se pudo geocodificar la dirección",
        });
      }

      return res.json({
        success: true,
        coords: {
          lat: geocoded.lat,
          lng: geocoded.lng,
        },
        formattedAddress: geocoded.formattedAddress,
        placeId: geocoded.placeId,
      });
    } catch (error: any) {
      console.error("Error en /api/geocode-address:", error);
      return res.status(500).json({
        error: "No se pudo geocodificar la dirección",
        details: error?.message || "Error desconocido",
      });
    }
  });

  // =========================
  // VITE
  // =========================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
