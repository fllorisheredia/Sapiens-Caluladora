import { z } from "zod";

const ibanVisibleOrMaskedRegex =
  /^[A-Z]{2}\d{2}[A-Z0-9* ]{10,34}$/i;

export const BillDataSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  lastName: z.string().min(2, "Apellidos requeridos"),
  dni: z
    .string()
    .regex(
      /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$|^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/,
      "DNI/NIE inválido",
    ),
  cups: z.string().length(20, "CUPS debe tener 20 caracteres"),
  address: z.string().min(5, "Dirección requerida"),

  // Permite IBAN normal o enmascarado con asteriscos
  iban: z
    .string()
    .regex(ibanVisibleOrMaskedRegex, "IBAN inválido"),

  email: z.string().email("Email inválido"),
  phone: z.string().min(9, "Teléfono inválido"),
  billType: z.enum(["2TD", "3TD"]),
  monthlyConsumption: z.number().positive("Consumo debe ser positivo"),

  // Nuevos campos para PDF y extracción
  ibanMasked: z.string().optional(),

  contractedPowerText: z.string().optional(),
  contractedPowerKw: z.number().nonnegative().optional(),
  contractedPowerP1: z.number().nonnegative().optional(),
  contractedPowerP2: z.number().nonnegative().optional(),
});

export type BillData = z.infer<typeof BillDataSchema>;

export const InstallationSchema = z.object({
  _id: z.string().optional(),
  name: z.string().min(2),
  code: z.string(),
  description: z.string().optional(),
  location: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
  }),
  pricePerKwpInvestment: z.number(),
  pricePerKwpService: z.number(),
  pricePerKwpMaintenance: z.number(),
  effectiveHours: z.number(),
  totalGeneratedPowerKwp: z.number(),
  totalStoredPowerKwp: z.number(),
  availablePowerKwp: z.number(),
  availabilityRadiusMeters: z.number(),
  associatedLinks: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  status: z.enum(["active", "inactive"]),
});

export type Installation = z.infer<typeof InstallationSchema>;

export const ClientSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  lastname1: z.string().optional(),
  lastname2: z.string().optional(),
  dni: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  iban: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
});

export type Client = z.infer<typeof ClientSchema>;

export const DocumentSchema = z.object({
  _id: z.string().optional(),
  fileName: z.string(),
  type: z.string(),
  status: z.string(),
  webViewLink: z.string().optional(),
  client: z.any().optional(),
  proposal: z.any().optional(),
  createdAt: z.string().optional(),
});

export type Document = z.infer<typeof DocumentSchema>;