import React, { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import InstallationMap from "./InstallationMap";
import { cn, formatCurrency, formatNumber } from "../../lib/utils";
import { sileo } from "sileo";

interface InstallationRow {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  horas_efectivas: number;
  potencia_instalada_kwp: number;
  almacenamiento_kwh: number;
  coste_anual_mantenimiento_por_kwp: number;
  coste_kwh_inversion: number;
  coste_kwh_servicio: number;
  porcentaje_autoconsumo: number;
  modalidad: "Inversion" | "Servicio" | "Ambas";
  active: boolean;
  created_at?: string;
  updated_at?: string;
  clients_count?: number;
  kwp_consumed?: number;
  kwp_available?: number;
  kwp_reserved?: number;
  kwp_confirmed?: number;
}

interface AssociatedClient {
  name: string;
  email: string;
  status?: string;
}

interface Props {
  installation: InstallationRow | null;
  clientsCount: number;
  consumedKwp: number;
  availableKwp: number;
  occupancyPercent: number;
  associatedClients: AssociatedClient[];
  onClose: () => void;
  onSave: (
    installationId: string,
    payload: Partial<InstallationRow>,
  ) => Promise<void>;
  onDelete: (installationId: string) => void | Promise<void>;
}

type InstallationFormData = {
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  horas_efectivas: number;
  potencia_instalada_kwp: number;
  almacenamiento_kwh: number;
  coste_anual_mantenimiento_por_kwp: number;
  coste_kwh_inversion: number;
  coste_kwh_servicio: number;
  porcentaje_autoconsumo: number;
  modalidad: "Inversion" | "Servicio" | "Ambas";
  active: boolean;
};

function formatModalidad(modalidad: InstallationRow["modalidad"]) {
  switch (modalidad) {
    case "Inversion":
      return "Inversión";
    case "Servicio":
      return "Servicio";
    default:
      return "Ambas";
  }
}

function formatAutoconsumo(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const normalized = value <= 1 ? value * 100 : value;
  return `${formatNumber(normalized)}%`;
}

function DetailCard({
  label,
  value,
  icon,
  tone = "sky",
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "sky" | "mint" | "amber" | "navy";
}) {
  const tones = {
    sky: "bg-brand-sky/10 text-brand-sky",
    mint: "bg-brand-mint/10 text-brand-mint",
    amber: "bg-amber-100 text-amber-600",
    navy: "bg-brand-navy/10 text-brand-navy",
  };

  return (
    <div className="rounded-[1.6rem] border border-brand-navy/5 bg-white px-5 py-5 shadow-sm min-w-0">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
            tones[tone],
          )}
        >
          <Icon icon={icon} className="w-5 h-5" />
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy/30">
            {label}
          </p>
          <p className="text-2xl font-bold text-brand-navy mt-2 truncate">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadonlyValue({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: string;
}) {
  if (!icon) {
    return <p className="text-xl font-bold text-brand-navy mt-3">{children}</p>;
  }

  return (
    <div className="flex items-start gap-3 mt-3">
      <Icon icon={icon} className="w-5 h-5 text-brand-sky shrink-0 mt-0.5" />
      <p className="text-sm text-brand-navy/70">{children}</p>
    </div>
  );
}

function InputField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "mt-3 w-full rounded-2xl border border-brand-navy/10 bg-white px-4 py-3 text-sm font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-brand-mint/20",
        props.className,
      )}
    />
  );
}

function TextareaField(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(
        "mt-3 w-full rounded-2xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-brand-navy outline-none focus:ring-2 focus:ring-brand-mint/20 resize-none",
        props.className,
      )}
    />
  );
}

function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "mt-3 w-full rounded-2xl border border-brand-navy/10 bg-white px-4 py-3 text-sm font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-brand-mint/20",
        props.className,
      )}
    />
  );
}

export default function InstallationDetailDrawer({
  installation,
  clientsCount,
  consumedKwp,
  availableKwp,
  occupancyPercent,
  associatedClients,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<InstallationFormData>({
    nombre_instalacion: "",
    direccion: "",
    lat: 0,
    lng: 0,
    horas_efectivas: 0,
    potencia_instalada_kwp: 0,
    almacenamiento_kwh: 0,
    coste_anual_mantenimiento_por_kwp: 0,
    coste_kwh_inversion: 0,
    coste_kwh_servicio: 0,
    porcentaje_autoconsumo: 0,
    modalidad: "Ambas",
    active: true,
  });

  useEffect(() => {
    if (!installation) return;

    setIsEditing(false);
    setFormData({
      nombre_instalacion: installation.nombre_instalacion ?? "",
      direccion: installation.direccion ?? "",
      lat: Number(installation.lat ?? 0),
      lng: Number(installation.lng ?? 0),
      horas_efectivas: Number(installation.horas_efectivas ?? 0),
      potencia_instalada_kwp: Number(installation.potencia_instalada_kwp ?? 0),
      almacenamiento_kwh: Number(installation.almacenamiento_kwh ?? 0),
      coste_anual_mantenimiento_por_kwp: Number(
        installation.coste_anual_mantenimiento_por_kwp ?? 0,
      ),
      coste_kwh_inversion: Number(installation.coste_kwh_inversion ?? 0),
      coste_kwh_servicio: Number(installation.coste_kwh_servicio ?? 0),
      porcentaje_autoconsumo: Number(installation.porcentaje_autoconsumo ?? 0),
      modalidad: installation.modalidad ?? "Ambas",
      active: Boolean(installation.active),
    });
  }, [installation]);

  const resetForm = () => {
    if (!installation) return;

    setFormData({
      nombre_instalacion: installation.nombre_instalacion ?? "",
      direccion: installation.direccion ?? "",
      lat: Number(installation.lat ?? 0),
      lng: Number(installation.lng ?? 0),
      horas_efectivas: Number(installation.horas_efectivas ?? 0),
      potencia_instalada_kwp: Number(installation.potencia_instalada_kwp ?? 0),
      almacenamiento_kwh: Number(installation.almacenamiento_kwh ?? 0),
      coste_anual_mantenimiento_por_kwp: Number(
        installation.coste_anual_mantenimiento_por_kwp ?? 0,
      ),
      coste_kwh_inversion: Number(installation.coste_kwh_inversion ?? 0),
      coste_kwh_servicio: Number(installation.coste_kwh_servicio ?? 0),
      porcentaje_autoconsumo: Number(installation.porcentaje_autoconsumo ?? 0),
      modalidad: installation.modalidad ?? "Ambas",
      active: Boolean(installation.active),
    });
  };

  const numericFields: Array<keyof InstallationFormData> = [
    "lat",
    "lng",
    "horas_efectivas",
    "potencia_instalada_kwp",
    "almacenamiento_kwh",
    "coste_anual_mantenimiento_por_kwp",
    "coste_kwh_inversion",
    "coste_kwh_servicio",
    "porcentaje_autoconsumo",
  ];

  const handleTextChange =
    (field: keyof InstallationFormData) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const value = e.target.value;

      setFormData((prev) => ({
        ...prev,
        [field]: numericFields.includes(field) ? Number(value) : value,
      }));
    };

  const handleToggleActive = () => {
    setFormData((prev) => ({
      ...prev,
      active: !prev.active,
    }));
  };

  const handleCancelEdit = () => {
    resetForm();
    setIsEditing(false);

    sileo.warning({
      title: "Edición cancelada",
      description: "Los cambios no se han guardado.",
    });
  };

  const handleSave = async () => {
    if (!installation) return;

    setIsSaving(true);
    try {
      await onSave(installation.id, formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving installation:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!installation) return null;

  const currentName = isEditing
    ? formData.nombre_instalacion
    : installation.nombre_instalacion;

  const currentAddress = isEditing
    ? formData.direccion
    : installation.direccion;
  const currentLat = isEditing ? formData.lat : installation.lat;
  const currentLng = isEditing ? formData.lng : installation.lng;
  const currentActive = isEditing ? formData.active : installation.active;
  const currentModalidad = isEditing
    ? formData.modalidad
    : installation.modalidad;
  const currentPotencia = isEditing
    ? formData.potencia_instalada_kwp
    : installation.potencia_instalada_kwp;
  const currentAlmacenamiento = isEditing
    ? formData.almacenamiento_kwh
    : installation.almacenamiento_kwh;
  const currentHoras = isEditing
    ? formData.horas_efectivas
    : installation.horas_efectivas;
  const currentAutoconsumo = isEditing
    ? formData.porcentaje_autoconsumo
    : installation.porcentaje_autoconsumo;
  const currentCosteServicio = isEditing
    ? formData.coste_kwh_servicio
    : installation.coste_kwh_servicio;
  const currentCosteInversion = isEditing
    ? formData.coste_kwh_inversion
    : installation.coste_kwh_inversion;
  const currentMantenimiento = isEditing
    ? formData.coste_anual_mantenimiento_por_kwp
    : installation.coste_anual_mantenimiento_por_kwp;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-brand-navy/35 backdrop-blur-[3px]"
        onClick={onClose}
      />

      <div className="relative h-full w-full max-w-[860px] bg-[#f8fafc] shadow-2xl border-l border-brand-navy/10 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-brand-navy/5 bg-white/90 backdrop-blur-md">
          <div className="px-6 md:px-8 py-5 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-navy/30">
                {isEditing ? "Editando instalación" : "Detalle de instalación"}
              </p>

              {isEditing ? (
                <InputField
                  value={formData.nombre_instalacion}
                  onChange={handleTextChange("nombre_instalacion")}
                  placeholder="Nombre de la instalación"
                  className="mt-3 text-lg"
                />
              ) : (
                <h2 className="text-3xl font-bold text-brand-navy mt-2 truncate">
                  {currentName}
                </h2>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    currentActive
                      ? "bg-green-100 text-green-600"
                      : "bg-red-100 text-red-600",
                  )}
                >
                  {currentActive ? "Activa" : "Inactiva"}
                </span>

                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-sky/10 text-brand-sky">
                  {formatModalidad(currentModalidad)}
                </span>

                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-navy/5 text-brand-navy/50">
                  {formatNumber(currentPotencia)} kWp
                </span>

                {isEditing && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700">
                    Modo edición
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl bg-brand-navy/[0.05] hover:bg-brand-navy/[0.08] flex items-center justify-center text-brand-navy transition-all shrink-0"
            >
              <Icon
                icon="solar:close-circle-bold-duotone"
                className="w-6 h-6"
              />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          <div className="rounded-[2rem] border border-brand-navy/5 bg-white p-4 shadow-sm">
            <InstallationMap
              lat={currentLat}
              lng={currentLng}
              title={currentName}
              subtitle={currentAddress}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-6 items-start">
            <div className="min-w-0 rounded-[2rem] border border-brand-navy/5 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-navy/30">
                    Ocupación de la instalación
                  </p>
                  <h3 className="text-3xl font-bold text-brand-navy mt-2">
                    {occupancyPercent}%
                  </h3>
                </div>

                <div className="w-14 h-14 rounded-2xl bg-brand-mint/10 text-brand-mint flex items-center justify-center shrink-0">
                  <Icon
                    icon="solar:chart-square-bold-duotone"
                    className="w-7 h-7"
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="h-4 rounded-full bg-brand-navy/5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      occupancyPercent >= 85
                        ? "bg-red-400"
                        : occupancyPercent >= 60
                          ? "bg-amber-400"
                          : "brand-gradient",
                    )}
                    style={{ width: `${occupancyPercent}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-[1.2rem] bg-brand-navy/[0.03] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
                      kWp usados
                    </p>
                    <p className="text-xl font-bold text-brand-navy mt-2">
                      {formatNumber(consumedKwp)}
                    </p>
                  </div>

                  <div className="rounded-[1.2rem] bg-brand-navy/[0.03] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
                      kWp libres
                    </p>
                    <p className="text-xl font-bold text-brand-navy mt-2">
                      {formatNumber(availableKwp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-[2rem] border border-brand-navy/5 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-navy/30">
                    Clientes asociados
                  </p>
                  <h3 className="text-xl font-bold text-brand-navy mt-2">
                    Vinculados a esta instalación
                  </h3>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-brand-sky/10 text-brand-sky flex items-center justify-center shrink-0">
                  <Icon icon="solar:user-id-bold-duotone" className="w-6 h-6" />
                </div>
              </div>

              <div className="mt-5 space-y-3 max-h-[280px] overflow-auto pr-1">
                {associatedClients.length === 0 ? (
                  <div className="rounded-[1.5rem] bg-brand-navy/[0.03] px-4 py-5 text-sm text-brand-navy/45">
                    No hay clientes asociados todavía.
                  </div>
                ) : (
                  associatedClients.map((client, index) => (
                    <div
                      key={`${client.email}-${index}`}
                      className="rounded-[1.4rem] border border-brand-navy/5 bg-brand-navy/[0.02] px-4 py-4 flex items-center justify-between gap-3 min-w-0"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-brand-navy/5 text-brand-navy font-bold flex items-center justify-center shrink-0">
                          {(client.name || "C").charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-bold text-brand-navy truncate">
                            {client.name || "Sin nombre"}
                          </p>
                          <p className="text-xs text-brand-navy/40 truncate mt-1">
                            {client.email || "Sin email"}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-mint/10 text-brand-mint">
                        {client.status ? client.status : "vinculado"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DetailCard
              label="Clientes adheridos"
              value={String(clientsCount)}
              icon="solar:users-group-rounded-bold-duotone"
              tone="sky"
            />
            <DetailCard
              label="kWp consumidos"
              value={formatNumber(consumedKwp)}
              icon="solar:bolt-bold-duotone"
              tone="amber"
            />
            <DetailCard
              label="kWp disponibles"
              value={formatNumber(availableKwp)}
              icon="solar:battery-charge-bold-duotone"
              tone="mint"
            />
          </div>

          <div className="rounded-[2rem] border border-brand-navy/5 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-navy/30">
                  Información técnica
                </p>
                <h3 className="text-xl font-bold text-brand-navy mt-2">
                  Datos principales de la instalación
                </h3>
              </div>

              <div className="w-12 h-12 rounded-2xl bg-brand-navy/10 text-brand-navy flex items-center justify-center">
                <Icon icon="solar:settings-bold-duotone" className="w-6 h-6" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Dirección
                </p>
                {isEditing ? (
                  <TextareaField
                    value={formData.direccion}
                    onChange={handleTextChange("direccion")}
                    rows={4}
                  />
                ) : (
                  <ReadonlyValue icon="solar:map-point-wave-bold-duotone">
                    {currentAddress || "Sin dirección"}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Estado
                </p>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={handleToggleActive}
                    className={cn(
                      "mt-3 inline-flex px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                      formData.active
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600",
                    )}
                  >
                    {formData.active ? "Activa" : "Inactiva"}
                  </button>
                ) : (
                  <ReadonlyValue>
                    {currentActive ? "Operativa" : "Inactiva"}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Potencia total
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    value={formData.potencia_instalada_kwp}
                    onChange={handleTextChange("potencia_instalada_kwp")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatNumber(currentPotencia)} kWp
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Almacenamiento
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    value={formData.almacenamiento_kwh}
                    onChange={handleTextChange("almacenamiento_kwh")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatNumber(currentAlmacenamiento)} kWh
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Modalidad
                </p>
                {isEditing ? (
                  <SelectField
                    value={formData.modalidad}
                    onChange={handleTextChange("modalidad")}
                  >
                    <option value="Inversion">Inversión</option>
                    <option value="Servicio">Servicio</option>
                    <option value="Ambas">Ambas</option>
                  </SelectField>
                ) : (
                  <ReadonlyValue>
                    {formatModalidad(currentModalidad)}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Horas efectivas
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    value={formData.horas_efectivas}
                    onChange={handleTextChange("horas_efectivas")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatNumber(currentHoras)} h/año
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Autoconsumo
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    value={formData.porcentaje_autoconsumo}
                    onChange={handleTextChange("porcentaje_autoconsumo")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatAutoconsumo(currentAutoconsumo)}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Coste servicio
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    step="0.01"
                    value={formData.coste_kwh_servicio}
                    onChange={handleTextChange("coste_kwh_servicio")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatCurrency(currentCosteServicio)}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Coste inversión
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    step="0.01"
                    value={formData.coste_kwh_inversion}
                    onChange={handleTextChange("coste_kwh_inversion")}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatCurrency(currentCosteInversion)}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Mantenimiento anual / kWp
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    step="0.01"
                    value={formData.coste_anual_mantenimiento_por_kwp}
                    onChange={handleTextChange(
                      "coste_anual_mantenimiento_por_kwp",
                    )}
                  />
                ) : (
                  <ReadonlyValue>
                    {formatCurrency(currentMantenimiento)}
                  </ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Latitud
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    step="0.000001"
                    value={formData.lat}
                    onChange={handleTextChange("lat")}
                  />
                ) : (
                  <ReadonlyValue>{formatNumber(currentLat, 6)}</ReadonlyValue>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-brand-navy/5 p-5 bg-[#fbfdff]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                  Longitud
                </p>
                {isEditing ? (
                  <InputField
                    type="number"
                    step="0.000001"
                    value={formData.lng}
                    onChange={handleTextChange("lng")}
                  />
                ) : (
                  <ReadonlyValue>{formatNumber(currentLng, 6)}</ReadonlyValue>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 h-[56px] rounded-[1.6rem] brand-gradient text-brand-navy font-bold shadow-lg shadow-brand-mint/20 flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  <Icon icon="solar:diskette-bold" className="w-5 h-5" />
                  {isSaving ? "Guardando..." : "Guardar cambios"}
                </button>

                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="flex-1 h-[56px] rounded-[1.6rem] bg-white text-brand-navy font-bold border border-brand-navy/10 flex items-center justify-center gap-3"
                >
                  <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                  Cancelar
                </button>

                <button
                  onClick={() => onDelete(installation.id)}
                  className="sm:max-w-[220px] h-[56px] rounded-[1.6rem] bg-red-50 text-red-600 font-bold border border-red-100 flex items-center justify-center gap-3 hover:bg-red-100 transition-all px-6"
                >
                  <Icon icon="solar:trash-bin-trash-bold" className="w-5 h-5" />
                  Eliminar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 h-[56px] rounded-[1.6rem] brand-gradient text-brand-navy font-bold shadow-lg shadow-brand-mint/20 flex items-center justify-center gap-3"
                >
                  <Icon icon="solar:pen-2-bold" className="w-5 h-5" />
                  Editar instalación
                </button>

                <button
                  onClick={() => onDelete(installation.id)}
                  className="flex-1 h-[56px] rounded-[1.6rem] bg-red-50 text-red-600 font-bold border border-red-100 flex items-center justify-center gap-3 hover:bg-red-100 transition-all"
                >
                  <Icon icon="solar:trash-bin-trash-bold" className="w-5 h-5" />
                  Eliminar instalación
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
