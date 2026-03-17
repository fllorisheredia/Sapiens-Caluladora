import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
// import dotenv from "dotenv";

import "dotenv/config";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { extractInvoiceWithFallback } from "./src/services/invoiceExtractionOrchestrator";

// dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);


function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
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

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use('/assets', express.static(path.join(__dirname, 'assets')));


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

  // =========================
  // STUDIES API
  // =========================

  app.post("/api/studies", async (req, res) => {
    try {
      const payload = req.body;

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
              installation.lng
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