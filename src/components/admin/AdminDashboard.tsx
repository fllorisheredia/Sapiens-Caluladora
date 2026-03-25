import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  Zap,
  LogOut,
  Search,
  Trash2,
  Edit,
  MapPin,
  Calendar,
  FileText,
  Sparkles,
  Loader2,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  RefreshCcw,
  Mail,
  Eye,
  LucideIcon,
  Activity,
} from "lucide-react";
import Button from "../ui/Button";
import { formatCurrency, formatNumber, cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { type Client, type Document } from "../../lib/validators";
import InstallationForm from "./InstallationForm";
import InstallationDetailDrawer from "./InstallationDetailDrawer";
import {sileo} from "sileo";
import { Icon } from "@iconify/react";
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
function getStudyCustomer(study: any) {
  return study?.customer ?? study?.clientData ?? study?.client ?? {};
}

function getStudyCustomerName(study: any) {
  if (study?.customerName) return study.customerName;

  const customer = getStudyCustomer(study);
  const name = customer?.name ?? customer?.nombre ?? "";
  const lastName =
    customer?.lastName ??
    customer?.lastname1 ??
    customer?.lastname ??
    customer?.apellidos ??
    "";

  return `${name} ${lastName}`.trim() || "Sin nombre";
}

function getStudyCustomerEmail(study: any) {
  if (study?.customerEmail) return study.customerEmail;

  const customer = getStudyCustomer(study);
  const invoiceData = study?.invoice_data ?? study?.invoiceData ?? {};

  return customer?.email ?? invoiceData?.email ?? study?.email ?? "";
}

function getStudyCreatedAt(study: any) {
  return (
    study?.displayCreatedAt ??
    study?.created_at ??
    study?.createdAt ??
    study?.updated_at ??
    study?.updatedAt ??
    null
  );
}

function getStudyType(study: any) {
  if (study?.displayType) return study.displayType;

  const customer = getStudyCustomer(study);
  const invoiceData = study?.invoice_data ?? study?.invoiceData ?? {};

  return (
    study?.clientType ??
    customer?.type ??
    invoiceData?.tariffType ??
    invoiceData?.tarifa_acceso ??
    invoiceData?.tarifa ??
    study?.proposal_mode ??
    "Sin tipo"
  );
}

function getStudyInstallationName(
  study: any,
  installationsList: InstallationRow[] = [],
) {
  if (study?.installationDisplayName) return study.installationDisplayName;

  const snapshot = study?.selected_installation_snapshot ?? {};

  const snapshotName =
    snapshot?.installationName ||
    snapshot?.installationData?.nombre_instalacion ||
    snapshot?.nombre_instalacion;

  if (snapshotName) return snapshotName;

  const selectedId = study?.selected_installation_id;
  if (selectedId) {
    const matched = installationsList.find(
      (inst) => String(inst.id) === String(selectedId),
    );
    if (matched?.nombre_instalacion) return matched.nombre_instalacion;
  }

  return "Sin instalación";
}

function getStudyAnnualSavings(study: any) {
  return Number(
    study?.annualSavings ??
      study?.results?.annualSavings ??
      study?.calculation?.annualSavings ??
      study?.calculation?.ahorro_anual ??
      study?.calculation_result?.annualSavings ??
      0,
  );
}

function normalizeStudy(study: any, installationsList: InstallationRow[] = []) {
  const customerName = getStudyCustomerName(study);
  const customerEmail = getStudyCustomerEmail(study);
  const displayCreatedAt = getStudyCreatedAt(study);
  const displayType = getStudyType(study);
  const annualSavings = getStudyAnnualSavings(study);
  const installationDisplayName = getStudyInstallationName(
    study,
    installationsList,
  );

  return {
    ...study,
    id: String(study?.id ?? study?._id ?? ""),
    customerName,
    customerEmail,
    customerInitial: customerName.charAt(0).toUpperCase() || "S",
    displayCreatedAt,
    displayType,
    annualSavings,
    installationDisplayName,
    status: study?.status ?? "uploaded",
    email_status: study?.email_status ?? study?.emailStatus ?? "pending",
  };
}

function normalizeStudies(
  rows: any[],
  installationsList: InstallationRow[] = [],
) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeStudy(row, installationsList));
}

// function getStudyInstallationName(
//   study: any,
//   installationsList: InstallationRow[] = [],
// ) {
//   const snapshot = study?.selected_installation_snapshot ?? {};

//   const snapshotName =
//     snapshot?.installationName ||
//     snapshot?.installationData?.nombre_instalacion;

//   if (snapshotName) return snapshotName;

//   const selectedId = study?.selected_installation_id;
//   if (selectedId) {
//     const matched = installationsList.find(
//       (inst) => String(inst.id) === String(selectedId),
//     );
//     if (matched?.nombre_instalacion) return matched.nombre_instalacion;
//   }

//   return "Sin instalación";
// }

// function getStudyAnnualSavings(study: any) {
//   return Number(
//     study?.calculation?.annualSavings ?? study?.calculation?.ahorro_anual ?? 0,
//   );
// }

function buildDailySeries(items: any[], days = 7) {
  const now = new Date();
  const map = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }

  items.forEach((item) => {
    const rawDate = item?.created_at ?? item?.createdAt;
    if (!rawDate) return;

    const key = new Date(rawDate).toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, (map.get(key) || 0) + 1);
    }
  });

  return Array.from(map.entries()).map(([date, total]) => ({
    date,
    label: new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
    }),
    total,
  }));
}

function AnimatedBarChart({
  title,
  data,
}: {
  title: string;
  data: { key: string; label: string; total: number }[];
}) {
  const max = Math.max(...data.map((item) => item.total), 1);

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8 min-w-0 overflow-hidden">
      <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
      <p className="text-xs text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
        Datos reales
      </p>

      <div className="mt-8 space-y-5">
        {data.map((item, index) => (
          <div key={item.key} className="min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <span
                title={item.label}
                className="text-sm font-bold text-brand-navy/70 block min-w-0 break-all leading-tight"
              >
                {item.label}
              </span>

              <span className="text-xs font-bold text-brand-navy/40 shrink-0">
                {item.total}
              </span>
            </div>

            <div className="h-3 rounded-full bg-brand-navy/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.total / max) * 100}%` }}
                transition={{ duration: 0.7, delay: index * 0.08 }}
                className="h-full rounded-full brand-gradient"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
type ChartItem = {
  key: string;
  label: string;
  total: number;
};

function getStudyStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    uploaded: "Subido",
    validated: "Validado",
    location_selected: "Ubicación",
    calculating: "Calculando",
    completed: "Completado",
    error: "Error",
  };

  return labels[status || ""] || status || "Sin estado";
}

function getStudyStatusClasses(status?: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "error":
      return "bg-red-100 text-red-600";
    case "calculating":
      return "bg-amber-100 text-amber-700";
    case "validated":
    case "uploaded":
    case "location_selected":
      return "bg-brand-sky/10 text-brand-sky";
    default:
      return "bg-brand-navy/5 text-brand-navy/50";
  }
}

function DashboardStatCard({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "sky",
  delay = 0,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "sky" | "mint" | "navy" | "amber";
  delay?: number;
}) {
  const toneClasses = {
    sky: "bg-brand-sky/10 text-brand-sky",
    mint: "bg-brand-mint/10 text-brand-mint",
    navy: "bg-brand-navy/10 text-brand-navy",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative overflow-hidden rounded-[2.2rem] bg-white border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-7"
    >
      <div className="absolute inset-x-0 top-0 h-1 brand-gradient opacity-70" />
      <div className="absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-brand-mint/10 blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-brand-navy/30 uppercase tracking-[0.2em]">
            {label}
          </p>
          <p className="text-3xl font-bold text-brand-navy leading-none mt-4">
            {value}
          </p>
        </div>

        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center",
            toneClasses[tone],
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>

      <div className="mt-5 inline-flex rounded-full bg-brand-navy/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-navy/50">
        {subtext}
      </div>
    </motion.div>
  );
}

function TrendChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; total: number }[];
}) {
  if (!data.length) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8">
        <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
        <p className="mt-6 text-sm text-brand-navy/40">No hay datos aún.</p>
      </div>
    );
  }

  const width = 640;
  const height = 230;
  const padding = 28;
  const max = Math.max(...data.map((item) => item.total), 1);

  const points = data.map((item, index) => {
    const x =
      padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
    const y = height - padding - (item.total / max) * (height - padding * 2);
    return { x, y, ...item };
  });

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    height - padding
  } L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
          <p className="text-xs text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
            Últimos 7 días
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-brand-mint/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-mint">
          <TrendingUp className="w-3.5 h-3.5" />
          Tendencia real
        </div>
      </div>

      <div className="mt-6">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
          {[0, 1, 2, 3].map((line) => {
            const y = padding + (line * (height - padding * 2)) / 3;
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="rgba(15,23,42,0.08)"
                strokeDasharray="6 6"
              />
            );
          })}

          <defs>
            <linearGradient
              id="dashboardTrendStroke"
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor="#57d9d3" />
              <stop offset="100%" stopColor="#7fb8ff" />
            </linearGradient>
            <linearGradient id="dashboardTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(87,217,211,0.22)" />
              <stop offset="100%" stopColor="rgba(87,217,211,0.02)" />
            </linearGradient>
          </defs>

          <motion.path
            d={areaPath}
            fill="url(#dashboardTrendFill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          <motion.path
            d={linePath}
            fill="none"
            stroke="url(#dashboardTrendStroke)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.1 }}
          />

          {points.map((point, index) => (
            <motion.g
              key={point.label}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.08 }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r="8"
                fill="rgba(87,217,211,0.18)"
              />
              <circle cx={point.x} cy={point.y} r="4.5" fill="#57d9d3" />
            </motion.g>
          ))}
        </svg>

        <div className="grid grid-cols-7 gap-2 mt-2">
          {data.map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-[10px] font-bold text-brand-navy/30">
                {item.label}
              </p>
              <p className="text-xs font-bold text-brand-navy">{item.total}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DonutChart({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; total: number }[];
}) {
  const total = Math.max(
    items.reduce((acc, item) => acc + item.total, 0),
    1,
  );

  const colors = ["#57d9d3", "#7fb8ff", "#12263f", "#f59e0b", "#8b5cf6"];
  const size = 190;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8 min-w-0 overflow-hidden">
      <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
      <p className="text-xs text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
        Distribución actual
      </p>

      <div className="mt-6 flex flex-col items-center gap-6">
        <div className="relative shrink-0">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(15,23,42,0.08)"
              strokeWidth={stroke}
              fill="none"
            />

            {items.map((item, index) => {
              const fraction = item.total / total;
              const dashLength = fraction * circumference;
              const dashOffset = -accumulated * circumference;
              accumulated += fraction;

              return (
                <motion.circle
                  key={item.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={colors[index % colors.length]}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${dashLength} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{
                    strokeDasharray: `${dashLength} ${circumference}`,
                  }}
                  transition={{ duration: 0.8, delay: index * 0.12 }}
                />
              );
            })}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
              Total
            </p>
            <p className="text-3xl font-bold text-brand-navy leading-none mt-2">
              {items.reduce((acc, item) => acc + item.total, 0)}
            </p>
          </div>
        </div>

        <div className="w-full grid grid-cols-1 gap-3">
          {items.map((item, index) => {
            const percentage =
              total > 0 ? Math.round((item.total / total) * 100) : 0;

            return (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-2xl bg-brand-navy/[0.02] px-4 py-3 min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  <span className="text-sm font-bold text-brand-navy/70 truncate">
                    {item.label}
                  </span>
                </div>

                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-bold text-brand-navy">
                    {item.total}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
                    {percentage}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecentStudiesCard({ studies }: { studies: any[] }) {
  const [showAll, setShowAll] = useState(false);

  const visibleStudies = showAll ? studies : studies.slice(0, 3);

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-brand-navy">Últimos estudios</h3>
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-sky/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-sky">
          <Activity className="w-3.5 h-3.5" />
          Actividad reciente
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {visibleStudies.length === 0 ? (
          <p className="text-sm text-brand-navy/40">No hay estudios aún.</p>
        ) : (
          visibleStudies.map((study, index) => (
            <motion.div
              key={study.id ?? study._id ?? index}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-[1.6rem] bg-brand-navy/[0.02] px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-brand-navy truncate">
                  {getStudyCustomerName(study)}
                </p>
                <p className="text-xs text-brand-navy/40 mt-1 truncate">
                  {study.installationDisplayName || "Sin instalación"}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                    getStudyStatusClasses(study?.status),
                  )}
                >
                  {getStudyStatusLabel(study?.status)}
                </span>

                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30 mt-3">
                  {study?.created_at || study?.createdAt
                    ? new Date(
                        study.created_at ?? study.createdAt,
                      ).toLocaleDateString("es-ES")
                    : "-"}
                </p>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {studies.length > 3 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowAll((prev) => !prev)}
            className="px-5 py-3 rounded-2xl bg-brand-navy/[0.04] hover:bg-brand-navy/[0.07] text-sm font-bold text-brand-navy transition-all"
          >
            {showAll ? "Mostrar menos" : "Mostrar más"}
          </button>
        </div>
      )}
    </div>
  );
}

function AlertsCard({ alerts }: { alerts: string[] }) {
  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-brand-navy">Alertas</h3>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          Supervisión
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {alerts.length === 0 ? (
          <div className="rounded-2xl bg-green-50 text-green-700 px-4 py-4 text-sm font-bold">
            Todo controlado. No hay alertas críticas.
          </div>
        ) : (
          alerts.map((alert, index) => (
            <motion.div
              key={alert}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className="rounded-2xl bg-amber-50 text-amber-700 px-4 py-4 text-sm font-bold"
            >
              {alert}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function normalizeInstallation(row: any): InstallationRow {
  const modalidadRaw = String(row?.modalidad ?? "ambas").toLowerCase();

  let modalidad: InstallationRow["modalidad"] = "Ambas";
  if (modalidadRaw === "inversion") modalidad = "Inversion";
  else if (modalidadRaw === "servicio") modalidad = "Servicio";
  else modalidad = "Ambas";

  const potenciaTotal = Number(
    row?.potencia_instalada_kwp ??
      row?.contractable_kwp_total ??
      row?.total_kwp ??
      0,
  );

  const kwpReserved = Number(
    row?.kwp_reserved ??
      row?.contractable_kwp_reserved ??
      row?.reserved_kwp ??
      0,
  );

  const kwpConfirmed = Number(
    row?.kwp_confirmed ??
      row?.contractable_kwp_confirmed ??
      row?.confirmed_kwp ??
      0,
  );

  const kwpConsumed = Number(
    row?.kwp_consumed ??
      row?.contractable_kwp_consumed ??
      kwpReserved + kwpConfirmed,
  );

  const kwpAvailable = Number(
    row?.kwp_available ??
      row?.contractable_kwp_available ??
      Math.max(potenciaTotal - kwpConsumed, 0),
  );

  return {
    id: String(row?.id ?? ""),
    nombre_instalacion: row?.nombre_instalacion ?? "",
    direccion: row?.direccion ?? "",
    lat: Number(row?.lat ?? 0),
    lng: Number(row?.lng ?? 0),
    horas_efectivas: Number(row?.horas_efectivas ?? 0),
    potencia_instalada_kwp: potenciaTotal,
    almacenamiento_kwh: Number(row?.almacenamiento_kwh ?? 0),
    coste_anual_mantenimiento_por_kwp: Number(
      row?.coste_anual_mantenimiento_por_kwp ?? 0,
    ),
    coste_kwh_inversion: Number(row?.coste_kwh_inversion ?? 0),
    coste_kwh_servicio: Number(row?.coste_kwh_servicio ?? 0),
    porcentaje_autoconsumo: Number(row?.porcentaje_autoconsumo ?? 0),
    modalidad,
    active: Boolean(row?.active),
    created_at: row?.created_at,
    updated_at: row?.updated_at,

    clients_count: Number(
      row?.clients_count ?? row?.attached_clients_count ?? 0,
    ),
    kwp_consumed: kwpConsumed,
    kwp_available: kwpAvailable,
    kwp_reserved: kwpReserved,
    kwp_confirmed: kwpConfirmed,
  };
}

function getInstallationRelatedStudies(
  installation: InstallationRow,
  studies: any[],
) {
  return studies.filter((study) => {
    const selectedId = study?.selected_installation_id;
    const displayName = getStudyInstallationName(study, [installation]);

    return (
      String(selectedId) === String(installation.id) ||
      displayName === installation.nombre_instalacion
    );
  });
}

function getInstallationClientsCount(
  installation: InstallationRow,
  studies: any[],
) {
  if (
    typeof installation.clients_count === "number" &&
    installation.clients_count > 0
  ) {
    return installation.clients_count;
  }

  const relatedStudies = getInstallationRelatedStudies(installation, studies);

  const uniqueClients = new Set(
    relatedStudies
      .map(
        (study) => getStudyCustomerEmail(study) || getStudyCustomerName(study),
      )
      .filter(Boolean),
  );

  return uniqueClients.size;
}

function getInstallationOccupancyPercent(
  installation: InstallationRow,
  studies: any[],
) {
  const total = Number(installation.potencia_instalada_kwp || 0);
  const consumed = getInstallationConsumedKwp(installation, studies);

  if (total <= 0) return 0;
  return Math.min(100, Math.round((consumed / total) * 100));
}

function getInstallationAssociatedClients(
  installation: InstallationRow,
  studies: any[],
) {
  const relatedStudies = getInstallationRelatedStudies(installation, studies);

  const uniqueClientsMap = new Map<
    string,
    {
      name: string;
      email: string;
      status?: string;
    }
  >();

  relatedStudies.forEach((study) => {
    const name = getStudyCustomerName(study);
    const email = getStudyCustomerEmail(study);
    const key = email || name;

    if (!key) return;

    if (!uniqueClientsMap.has(key)) {
      uniqueClientsMap.set(key, {
        name,
        email,
        status: study?.status,
      });
    }
  });

  return Array.from(uniqueClientsMap.values());
}

function getInstallationConsumedKwp(
  installation: InstallationRow,
  studies: any[],
) {
  if (
    typeof installation.kwp_consumed === "number" &&
    installation.kwp_consumed > 0
  ) {
    return installation.kwp_consumed;
  }

  return Number(
    (installation.kwp_reserved ?? 0) + (installation.kwp_confirmed ?? 0),
  );
}

function getInstallationAvailableKwp(
  installation: InstallationRow,
  studies: any[],
) {
  if (typeof installation.kwp_available === "number") {
    return installation.kwp_available;
  }

  const consumed = getInstallationConsumedKwp(installation, studies);
  return Math.max(
    Number(installation.potencia_instalada_kwp || 0) - consumed,
    0,
  );
}

function normalizeInstallations(rows: any[]): InstallationRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeInstallation);
}

function formatModalidad(modalidad: InstallationRow["modalidad"]) {
  switch (modalidad) {
    case "Inversion":
      return "Inversión";
    case "Servicio":
      return "Servicio";
    case "Ambas":
    default:
      return "Ambas";
  }
}

function formatAutoconsumo(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const normalized = value <= 1 ? value * 100 : value;
  return `${formatNumber(normalized)}%`;
}

function TopInstallationsExecutive({
  title,
  data,
}: {
  title: string;
  data: { key: string; label: string; total: number }[];
}) {
  const sortedData = [...data]
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);

  const totalUses = sortedData.reduce((acc, item) => acc + item.total, 0);
  const topItem = sortedData[0];

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 p-8 min-w-0 overflow-hidden self-start">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
          <p className="text-xs text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
            Ranking actual
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-brand-mint/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-mint">
          Top
        </div>
      </div>

      {sortedData.length === 0 ? (
        <div className="mt-6 rounded-[1.8rem] bg-brand-navy/[0.03] px-5 py-6">
          <p className="text-sm font-bold text-brand-navy">
            No hay instalaciones usadas todavía
          </p>
          <p className="text-xs text-brand-navy/40 mt-2">
            Cuando haya estudios asociados, aparecerá aquí el ranking.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-[2rem] bg-[linear-gradient(135deg,rgba(87,217,211,0.10),rgba(127,184,255,0.10))] border border-brand-navy/5 px-5 py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
              Instalación líder
            </p>

            <div className="flex items-center justify-between gap-4 mt-3">
              <div className="min-w-0">
                <p className="text-xl font-bold text-brand-navy truncate">
                  {topItem.label}
                </p>
                <p className="text-sm text-brand-navy/45 mt-1">
                  {topItem.total} estudio(s) asociados
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-navy">
                  {totalUses > 0
                    ? Math.round((topItem.total / totalUses) * 100)
                    : 0}
                  %
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
                  del uso total
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {sortedData.map((item, index) => {
              const percentage =
                totalUses > 0 ? Math.round((item.total / totalUses) * 100) : 0;

              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="rounded-[1.6rem] bg-brand-navy/[0.025] px-4 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0",
                        index === 0
                          ? "bg-brand-mint/15 text-brand-mint"
                          : "bg-brand-navy/6 text-brand-navy/60",
                      )}
                    >
                      #{index + 1}
                    </div>

                    <div className="min-w-0">
                      <p
                        title={item.label}
                        className="text-sm font-bold text-brand-navy truncate"
                      >
                        {item.label}
                      </p>
                      <p className="text-[11px] text-brand-navy/40 mt-1">
                        {percentage}% del total
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-brand-navy">
                      {item.total}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/30">
                      estudios
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
type ActiveTab =
  | "dashboard"
  | "studies"
  | "clients"
  | "installations"
  | "documents";

function getTopStatCards(
  activeTab: ActiveTab,
  dashboardData: {
    totalStudies: number;
    totalClients: number;
    totalDocuments: number;
    completedStudies: number;
    inProgressStudies: number;
    errorStudies: number;
    pendingEmails: number;
    sentEmails: number;
    failedEmails: number;
    activeInstallations: number;
    totalInstalledPower: number;
  },
) {
  switch (activeTab) {
    case "studies":
      return [
        {
          label: "Estudios totales",
          value: dashboardData.totalStudies.toString(),
          subtext: `${dashboardData.completedStudies} completados`,
          icon: FileText,
          tone: "sky" as const,
        },
        {
          label: "En proceso",
          value: dashboardData.inProgressStudies.toString(),
          subtext: `${dashboardData.pendingEmails} emails pendientes`,
          icon: Zap,
          tone: "mint" as const,
        },
        {
          label: "Emails enviados",
          value: dashboardData.sentEmails.toString(),
          subtext: `${dashboardData.failedEmails} fallidos`,
          icon: Mail,
          tone: "navy" as const,
        },
        {
          label: "Errores detectados",
          value: dashboardData.errorStudies.toString(),
          subtext: "Requieren revisión",
          icon: AlertTriangle,
          tone: "amber" as const,
        },
      ];

    case "clients":
      return [
        {
          label: "Clientes totales",
          value: dashboardData.totalClients.toString(),
          subtext: "Base registrada",
          icon: Users,
          tone: "navy" as const,
        },
        {
          label: "Estudios asociados",
          value: dashboardData.totalStudies.toString(),
          subtext: `${dashboardData.completedStudies} completados`,
          icon: FileText,
          tone: "sky" as const,
        },
        {
          label: "Emails enviados",
          value: dashboardData.sentEmails.toString(),
          subtext: "Comunicación realizada",
          icon: Mail,
          tone: "mint" as const,
        },
        {
          label: "Pendientes",
          value: dashboardData.inProgressStudies.toString(),
          subtext: "Actividad abierta",
          icon: Activity,
          tone: "amber" as const,
        },
      ];

    case "installations":
      return [
        {
          label: "Instalaciones activas",
          value: dashboardData.activeInstallations.toString(),
          subtext: "Disponibles ahora",
          icon: MapPin,
          tone: "mint" as const,
        },
        {
          label: "Potencia total",
          value: `${formatNumber(dashboardData.totalInstalledPower)} kWp`,
          subtext: "Capacidad activa",
          icon: Zap,
          tone: "sky" as const,
        },
        {
          label: "Estudios asociados",
          value: dashboardData.totalStudies.toString(),
          subtext: "Uso acumulado",
          icon: FileText,
          tone: "navy" as const,
        },
        {
          label: "Clientes impactados",
          value: dashboardData.totalClients.toString(),
          subtext: "Cobertura actual",
          icon: Users,
          tone: "amber" as const,
        },
      ];

    case "documents":
      return [
        {
          label: "Documentos",
          value: dashboardData.totalDocuments.toString(),
          subtext: "Total registrado",
          icon: FileText,
          tone: "sky" as const,
        },
        {
          label: "Emails enviados",
          value: dashboardData.sentEmails.toString(),
          subtext: "Asociados a estudios",
          icon: Mail,
          tone: "mint" as const,
        },
        {
          label: "Errores",
          value: dashboardData.errorStudies.toString(),
          subtext: "Requieren revisión",
          icon: AlertTriangle,
          tone: "amber" as const,
        },
        {
          label: "Clientes",
          value: dashboardData.totalClients.toString(),
          subtext: "Con documentación",
          icon: Users,
          tone: "navy" as const,
        },
      ];

    case "dashboard":
    default:
      return [
        {
          label: "Estudios totales",
          value: dashboardData.totalStudies.toString(),
          subtext: `${dashboardData.completedStudies} completados`,
          icon: FileText,
          tone: "sky" as const,
        },
        {
          label: "En proceso",
          value: dashboardData.inProgressStudies.toString(),
          subtext: `${dashboardData.pendingEmails} emails pendientes`,
          icon: Zap,
          tone: "mint" as const,
        },
        {
          label: "Clientes",
          value: dashboardData.totalClients.toString(),
          subtext: `${dashboardData.totalDocuments} documentos`,
          icon: Users,
          tone: "navy" as const,
        },
        {
          label: "Errores detectados",
          value: dashboardData.errorStudies.toString(),
          subtext: `${dashboardData.sentEmails} emails enviados`,
          icon: AlertTriangle,
          tone: "amber" as const,
        },
      ];
  }
}

function getPaginationRange(currentPage: number, totalPages: number) {
  const delta = 1;
  const range: (number | string)[] = [];
  const rangeWithDots: (number | string)[] = [];

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      range.push(i);
    }
  }

  let last: number | undefined;
  for (const item of range) {
    if (typeof item === "number") {
      if (last !== undefined) {
        if (item - last === 2) {
          rangeWithDots.push(last + 1);
        } else if (item - last > 2) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(item);
      last = item;
    }
  }

  return rangeWithDots;
}
export default function AdminDashboard() {
  // const [activeTab, setActiveTab] = useState("studies");
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [studies, setStudies] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [installations, setInstallations] = useState<InstallationRow[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInstallationForm, setShowInstallationForm] = useState(false);
  const [editingInstallation, setEditingInstallation] = useState<
    InstallationRow | undefined
  >(undefined);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [selectedInstallation, setSelectedInstallation] =
    useState<InstallationRow | null>(null);

  // useEffect(() => {
  //   fetchAllData();
  // }, []);
  useEffect(() => {
    if (activeTab === "dashboard") {
      fetchAllData(true);
    } else {
      fetchTabData();
    }
  }, [activeTab]);
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setSearchTerm("");
  }, [activeTab]);

  // useEffect(() => {
  //   fetchTabData();
  // }, [activeTab]);

  // const fetchAllData = async (showLoader = false) => {
  //   if (showLoader) setIsLoading(true);

  //   try {
  //     const [studiesRes, clientsRes, installationsRes, docsRes] =
  //       await Promise.all([
  //         axios.get("/api/studies"),
  //         axios.get("/api/clients"),
  //         axios.get("/api/installations"),
  //         axios.get("/api/documents"),
  //       ]);

  //     setStudies(Array.isArray(studiesRes.data) ? studiesRes.data : []);
  //     setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
  //     setInstallations(normalizeInstallations(installationsRes.data));
  //     setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
  //   } catch (error) {
  //     console.error("Error fetching initial data:", error);
  //   } finally {
  //     if (showLoader) setIsLoading(false);
  //   }
  // };

  const fetchAllData = async (showLoader = false) => {
    if (showLoader) setIsLoading(true);

    try {
      const [studiesRes, clientsRes, installationsRes, docsRes] =
        await Promise.all([
          axios.get("/api/studies"),
          axios.get("/api/clients"),
          axios.get("/api/installations"),
          axios.get("/api/documents"),
        ]);

      const normalizedInstallations = normalizeInstallations(
        installationsRes.data,
      );
      const normalizedStudies = normalizeStudies(
        Array.isArray(studiesRes.data) ? studiesRes.data : [],
        normalizedInstallations,
      );

      setStudies(normalizedStudies);
      setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setInstallations(normalizedInstallations);
      setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

const handleUpdateInstallation = async (
  installationId: string,
  payload: Partial<InstallationRow>,
) => {
  try {
    const res = await sileo.promise(
  axios.put(`/api/installations/${installationId}`, payload),
  {
    loading: {
      title: "Guardando cambios",
      description: "Actualizando la instalación...",
      icon: <Icon icon="solar:refresh-circle-bold-duotone" className="w-5 h-5" />,
    },
    success: {
      title: "Instalación actualizada",
      description: "Los datos se han guardado correctamente.",
      icon: <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5" />,
    },
    error: {
      title: "Error al guardar",
      description: "No se pudo actualizar la instalación.",
      icon: <Icon icon="solar:danger-circle-bold-duotone" className="w-5 h-5" />,
    },
  }
);

    await fetchTabData();
    await fetchAllData();

    if (res?.data) {
      const normalized = normalizeInstallation(res.data);
      setSelectedInstallation(normalized);
    }
  } catch (error) {
    console.error("Error updating installation:", error);
  }
};
  // const fetchTabData = async () => {
  //   setIsLoading(true);

  //   try {
  //     if (activeTab === "dashboard") {
  //       await fetchAllData(false);
  //       return;
  //     }

  //     if (activeTab === "studies") {
  //       const res = await axios.get("/api/studies");
  //       setStudies(Array.isArray(res.data) ? res.data : []);
  //     } else if (activeTab === "clients") {
  //       const res = await axios.get("/api/clients");
  //       console.log("CLIENTS RESPONSE:", res.data);
  //       setClients(Array.isArray(res.data) ? res.data : []);
  //     } else if (activeTab === "installations") {
  //       const res = await axios.get("/api/installations");
  //       setInstallations(normalizeInstallations(res.data));
  //     } else if (activeTab === "documents") {
  //       const res = await axios.get("/api/documents");
  //       setDocuments(Array.isArray(res.data) ? res.data : []);
  //     }
  //   } catch (error) {
  //     console.error("Error fetching tab data:", error);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const fetchTabData = async () => {
    setIsLoading(true);

    try {
      if (activeTab === "dashboard") {
        await fetchAllData(false);
        return;
      }

      if (activeTab === "studies") {
        const [studiesRes, installationsRes] = await Promise.all([
          axios.get("/api/studies"),
          axios.get("/api/installations"),
        ]);

        const normalizedInstallations = normalizeInstallations(
          installationsRes.data,
        );
        const normalizedStudies = normalizeStudies(
          Array.isArray(studiesRes.data) ? studiesRes.data : [],
          normalizedInstallations,
        );

        setInstallations(normalizedInstallations);
        setStudies(normalizedStudies);
      } else if (activeTab === "clients") {
        const res = await axios.get("/api/clients");
        console.log("CLIENTS RESPONSE:", res.data);
        setClients(Array.isArray(res.data) ? res.data : []);
      } else if (activeTab === "installations") {
        const res = await axios.get("/api/installations");
        setInstallations(normalizeInstallations(res.data));
      } else if (activeTab === "documents") {
        const res = await axios.get("/api/documents");
        setDocuments(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error("Error fetching tab data:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const handleDeleteInstallation = async (id: string) => {
    const confirmed = window.confirm(
      "¿Seguro que quieres desactivar esta instalación?",
    );

    if (!confirmed) return;

    try {
      await axios.delete(`/api/installations/${id}`);
      await fetchAllData();
      if (activeTab === "installations") {
        await fetchTabData();
      }
    } catch (error) {
      console.error("Error deleting installation:", error);
    }
  };

  const displayedStudies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return studies;

    return studies.filter((study) =>
      [
        getStudyCustomerName(study),
        getStudyCustomerEmail(study),
        getStudyInstallationName(study, installations),
        getStudyType(study),
        getStudyStatusLabel(study?.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [studies, searchTerm, installations]);

  const displayedClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) =>
      [
        client.name,
        client.lastname1,
        client.email,
        client.phone,
        client.dni,
        (client as any).status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [clients, searchTerm]);

  const displayedInstallations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return installations;

    return installations.filter((inst) =>
      [
        inst.nombre_instalacion,
        inst.direccion,
        formatModalidad(inst.modalidad),
        inst.active ? "activa" : "inactiva",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [installations, searchTerm]);

  const displayedDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return documents;

    return documents.filter((doc: any) =>
      [doc.fileName, doc.type, doc.status, doc.client?.name]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [documents, searchTerm]);

  const currentItems = useMemo(() => {
    switch (activeTab) {
      case "studies":
        return displayedStudies;
      case "clients":
        return displayedClients;
      case "installations":
        return displayedInstallations;
      case "documents":
        return displayedDocuments;
      default:
        return [];
    }
  }, [
    activeTab,
    displayedStudies,
    displayedClients,
    displayedInstallations,
    displayedDocuments,
  ]);

  const totalItems = currentItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const paginatedItems = useMemo(() => {
    return currentItems.slice(startIndex, endIndex);
  }, [currentItems, startIndex, endIndex]);

  const tabLabels: Record<string, string> = {
    dashboard: "Dashboard",
    studies: "Estudios",
    clients: "Clientes",
    installations: "Instalaciones",
    documents: "Documentos",
  };

  const dashboardData = useMemo(() => {
    const safeStudies = Array.isArray(studies) ? studies : [];
    const safeClients = Array.isArray(clients) ? clients : [];
    const safeInstallations = Array.isArray(installations) ? installations : [];
    const safeDocuments = Array.isArray(documents) ? documents : [];

    const completedStudies = safeStudies.filter(
      (study) => study?.status === "completed",
    ).length;

    const errorStudies = safeStudies.filter(
      (study) => study?.status === "error",
    ).length;

    const inProgressStudies = safeStudies.filter((study) =>
      ["uploaded", "validated", "location_selected", "calculating"].includes(
        study?.status,
      ),
    ).length;

    const pendingEmails = safeStudies.filter(
      (study) => study?.email_status === "pending",
    ).length;

    const sentEmails = safeStudies.filter(
      (study) => study?.email_status === "sent",
    ).length;

    const failedEmails = safeStudies.filter(
      (study) => study?.email_status === "failed",
    ).length;

    const annualSavingsTotal = safeStudies.reduce(
      (acc, study) => acc + getStudyAnnualSavings(study),
      0,
    );

    const averageSavings =
      safeStudies.length > 0 ? annualSavingsTotal / safeStudies.length : 0;

    const activeInstallations = safeInstallations.filter(
      (inst) => inst.active,
    ).length;

    const totalInstalledPower = safeInstallations
      .filter((inst) => inst.active)
      .reduce((acc, inst) => acc + Number(inst.potencia_instalada_kwp || 0), 0);

    const completionRate =
      safeStudies.length > 0
        ? Math.round((completedStudies / safeStudies.length) * 100)
        : 0;

    const totalEmailsTracked = pendingEmails + sentEmails + failedEmails;
    const emailSuccessRate =
      totalEmailsTracked > 0
        ? Math.round((sentEmails / totalEmailsTracked) * 100)
        : 0;

    const statusOrder = [
      "uploaded",
      "validated",
      "location_selected",
      "calculating",
      "completed",
      "error",
    ];

    const statusLabels: Record<string, string> = {
      uploaded: "Subido",
      validated: "Validado",
      location_selected: "Ubicación",
      calculating: "Calculando",
      completed: "Completado",
      error: "Error",
    };

    const statusCounts = statusOrder.map((status) => ({
      key: status,
      label: statusLabels[status] || status,
      total: safeStudies.filter((study) => study?.status === status).length,
    }));

    const emailCounts = [
      { key: "pending", label: "Pendientes", total: pendingEmails },
      { key: "sent", label: "Enviados", total: sentEmails },
      { key: "failed", label: "Fallidos", total: failedEmails },
    ];

    const modalityCounts = [
      {
        key: "Inversion",
        label: "Inversión",
        total: safeInstallations.filter(
          (inst) => inst.modalidad === "Inversion",
        ).length,
      },
      {
        key: "Servicio",
        label: "Servicio",
        total: safeInstallations.filter((inst) => inst.modalidad === "Servicio")
          .length,
      },
      {
        key: "Ambas",
        label: "Ambas",
        total: safeInstallations.filter((inst) => inst.modalidad === "Ambas")
          .length,
      },
    ];

    const topInstallationsMap = safeStudies.reduce<Record<string, number>>(
      (acc, study) => {
        const name = getStudyInstallationName(study, safeInstallations);
        if (!name || name === "Sin instalación") return acc;
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      },
      {},
    );

    const topInstallationsChartData = Object.entries(topInstallationsMap)
      .map(([name, total]) => ({
        key: name,
        label: name,
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const studiesPerDay = buildDailySeries(safeStudies, 7);

    const recentStudies = [...safeStudies]
      .sort(
        (a, b) =>
          new Date(b?.created_at ?? b?.createdAt ?? 0).getTime() -
          new Date(a?.created_at ?? a?.createdAt ?? 0).getTime(),
      )
      .slice(0, 10)
      .map((study) => ({
        ...study,
        installationDisplayName: getStudyInstallationName(
          study,
          safeInstallations,
        ),
      }));

    const alerts = [
      errorStudies > 0 ? `${errorStudies} estudio(s) con error` : null,
      pendingEmails > 0 ? `${pendingEmails} email(s) pendientes` : null,
      safeStudies.filter((study) => !study?.selected_installation_id).length > 0
        ? `${
            safeStudies.filter((study) => !study?.selected_installation_id)
              .length
          } estudio(s) sin instalación asignada`
        : null,
    ].filter(Boolean) as string[];

    return {
      totalStudies: safeStudies.length,
      totalClients: safeClients.length,
      totalDocuments: safeDocuments.length,
      completedStudies,
      inProgressStudies,
      errorStudies,
      pendingEmails,
      sentEmails,
      failedEmails,
      annualSavingsTotal,
      averageSavings,
      activeInstallations,
      totalInstalledPower,
      completionRate,
      emailSuccessRate,
      statusCounts,
      emailCounts,
      modalityCounts,
      topInstallationsChartData,
      studiesPerDay,
      recentStudies,
      alerts,
    };
  }, [studies, clients, installations, documents]);
  const topStatCards = useMemo(
    () => getTopStatCards(activeTab, dashboardData),
    [activeTab, dashboardData],
  );

  const selectedInstallationClientsCount = useMemo(() => {
    if (!selectedInstallation) return 0;
    return getInstallationClientsCount(selectedInstallation, studies);
  }, [selectedInstallation, studies]);

  const selectedInstallationConsumedKwp = useMemo(() => {
    if (!selectedInstallation) return 0;
    return getInstallationConsumedKwp(selectedInstallation, studies);
  }, [selectedInstallation, studies]);

  const selectedInstallationAvailableKwp = useMemo(() => {
    if (!selectedInstallation) return 0;
    return getInstallationAvailableKwp(selectedInstallation, studies);
  }, [selectedInstallation, studies]);
  const selectedInstallationOccupancy = useMemo(() => {
    if (!selectedInstallation) return 0;
    return getInstallationOccupancyPercent(selectedInstallation, studies);
  }, [selectedInstallation, studies]);

  const selectedInstallationClients = useMemo(() => {
    if (!selectedInstallation) return [];
    return getInstallationAssociatedClients(selectedInstallation, studies);
  }, [selectedInstallation, studies]);

  return (
    <div className="flex flex-col lg:flex-row gap-10">
      {/* Sidebar */}
      <aside className="w-full lg:w-72 shrink-0">
        <div className="glass-card rounded-[2.5rem] p-8 space-y-2 border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
          <div className="px-4 mb-8">
            <p className="text-[10px] font-bold text-brand-navy/30 uppercase tracking-[0.2em]">
              Menú Principal
            </p>
          </div>

          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "studies", icon: Zap, label: "Estudios" },
            { id: "clients", icon: Users, label: "Clientes" },
            { id: "installations", icon: MapPin, label: "Instalaciones" },
            // { id: "documents", icon: FileText, label: "Documentos" },
            // { id: "settings", icon: Settings, label: "Configuración" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group",
                activeTab === item.id
                  ? "brand-gradient text-brand-navy shadow-lg shadow-brand-mint/20"
                  : "text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-navy",
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
                  activeTab === item.id
                    ? "text-brand-navy"
                    : "text-brand-navy/40",
                )}
              />
              {item.label}
            </button>
          ))}

          <div className="pt-12">
            <button className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all group">
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-sky/10 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-2">
              <Sparkles className="w-3 h-3 text-brand-sky" />
              Panel Administrativo
            </div>
            <h1 className="text-4xl font-bold text-brand-navy">
              {tabLabels[activeTab] || activeTab}
            </h1>
            <p className="text-sm text-brand-navy/40 mt-2">
              Vista optimizada para gestión, seguimiento y control comercial.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
            {activeTab !== "dashboard" && (
              <div className="relative w-full sm:w-[320px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/20" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar en ${tabLabels[activeTab]?.toLowerCase() || "datos"}...`}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-brand-navy/10 bg-white text-sm font-medium text-brand-navy shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-mint/20"
                />
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activeTab === "dashboard") {
                  fetchAllData(true);
                } else {
                  fetchTabData();
                }
              }}
              className="h-[50px] rounded-2xl border-brand-navy/10 bg-white font-bold px-5"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Actualizar
            </Button>

            {activeTab === "installations" && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingInstallation(undefined);
                  setShowInstallationForm(true);
                }}
                className="h-[50px] rounded-2xl brand-gradient text-brand-navy border-none font-bold px-5 shadow-lg shadow-brand-mint/20"
              >
                Nueva Instalación
              </Button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {topStatCards.map((card, index) => (
            <DashboardStatCard
              key={`${activeTab}-${card.label}-${index}`}
              label={card.label}
              value={card.value}
              subtext={card.subtext}
              icon={card.icon}
              tone={card.tone}
              delay={index * 0.08}
            />
          ))}
        </div>

        {activeTab === "dashboard" && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-[2.8rem] border border-brand-navy/5 bg-white shadow-2xl shadow-brand-navy/5 p-8 md:p-10"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(87,217,211,0.14),transparent_35%)] pointer-events-none" />
              <div className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-brand-sky/10 blur-3xl pointer-events-none" />

              <div className="relative grid grid-cols-1 gap-8">
                <div className="max-w-4xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-mint/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-mint mb-4">
                    <Activity className="w-3.5 h-3.5" />
                    Vista ejecutiva
                  </div>

                  <h2 className="text-3xl md:text-5xl font-bold text-brand-navy leading-tight">
                    Panel de Administración
                  </h2>

                  <p className="text-brand-navy/50 mt-4 max-w-3xl text-lg leading-relaxed">
                    Controla estudios, clientes, instalaciones, emails y
                    evolución diaria desde una vista más clara, más visual y más
                    útil para el administrador.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 max-w-3xl">
                    <div className="rounded-[1.6rem] bg-brand-navy/[0.03] px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                        Tasa completados
                      </p>
                      <p className="text-2xl font-bold text-brand-navy mt-2">
                        {dashboardData.completionRate}%
                      </p>
                    </div>

                    <div className="rounded-[1.6rem] bg-brand-navy/[0.03] px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                        Emails enviados OK
                      </p>
                      <p className="text-2xl font-bold text-brand-navy mt-2">
                        {dashboardData.emailSuccessRate}%
                      </p>
                    </div>

                    <div className="rounded-[1.6rem] bg-brand-navy/[0.03] px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy/30">
                        Instalaciones activas
                      </p>
                      <p className="text-2xl font-bold text-brand-navy mt-2">
                        {dashboardData.activeInstallations}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2">
                <TrendChart
                  title="Evolución de estudios"
                  data={dashboardData.studiesPerDay}
                />
              </div>

              {/* <DonutChart
                title="Estado de emails"
                items={dashboardData.emailCounts}
              /> */}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
              <div className="min-w-0 self-start">
                <TopInstallationsExecutive
                  title="Top instalaciones usadas"
                  data={dashboardData.topInstallationsChartData}
                />
              </div>

              <div className="min-w-0">
                <RecentStudiesCard studies={dashboardData.recentStudies} />
              </div>
            </div>
          </>
        )}

        {/* Table */}
        {activeTab !== "dashboard" && (
          <div className="bg-white rounded-[3rem] border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 overflow-hidden min-h-[400px] flex flex-col">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-brand-navy/30">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest">
                  Cargando datos reales...
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-navy/[0.02] border-b border-brand-navy/5">
                        {activeTab === "studies" && (
                          <>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Cliente
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Tipo
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Estado
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Ahorro Est.
                            </th>
                          </>
                        )}

                        {activeTab === "clients" && (
                          <>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Nombre
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Email
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Teléfono
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Estado
                            </th>
                          </>
                        )}

                        {activeTab === "installations" && (
                          <>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Instalación
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Dirección
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Potencia
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Modalidad
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Estado
                            </th>
                          </>
                        )}

                        {activeTab === "documents" && (
                          <>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Archivo
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Cliente
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Tipo
                            </th>
                            <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">
                              Estado
                            </th>
                          </>
                        )}

                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em] text-right">
                          Acciones
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-brand-navy/5">
                      <AnimatePresence mode="wait">
                        {activeTab === "studies" &&
                          (paginatedItems as any[]).map((study, i) => (
                            <motion.tr
                              key={study._id ?? study.id ?? i}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: i * 0.05 }}
                              className="hover:bg-brand-navy/[0.01] transition-colors group"
                            >
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center font-bold text-brand-navy text-xs">
                                    {study.customerInitial ||
                                      getStudyCustomerName(study).charAt(0)}
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-brand-navy group-hover:text-brand-mint transition-colors truncate">
                                      {getStudyCustomerName(study)}
                                    </p>

                                    <p className="text-[11px] text-brand-navy/40 mt-1 truncate">
                                      {getStudyCustomerEmail(study) ||
                                        "Sin email"}
                                    </p>

                                    <div className="flex items-center gap-2 text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
                                      <Calendar className="w-3 h-3" />
                                      {getStudyCreatedAt(study)
                                        ? new Date(
                                            getStudyCreatedAt(study),
                                          ).toLocaleDateString("es-ES")
                                        : "-"}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-8 py-6">
                                <div className="flex flex-col gap-2">
                                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-mint/10 text-brand-mint w-fit">
                                    {getStudyType(study)}
                                  </span>

                                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40 truncate">
                                    {getStudyInstallationName(
                                      study,
                                      installations,
                                    )}
                                  </span>
                                </div>
                              </td>

                              <td className="px-8 py-6">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                    getStudyStatusClasses(study?.status),
                                  )}
                                >
                                  {getStudyStatusLabel(study?.status)}
                                </span>
                              </td>

                              <td className="px-8 py-6">
                                <p className="text-sm font-bold text-brand-navy">
                                  {formatCurrency(getStudyAnnualSavings(study))}
                                  /año
                                </p>
                              </td>

                              <td className="px-8 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <button className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy">
                                    <Edit className="w-4 h-4" />
                                  </button>

                                  <button className="p-3 hover:bg-red-50 rounded-xl transition-all text-brand-navy/40 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          ))}

                        {activeTab === "clients" &&
                          (paginatedItems as Client[]).map((client, i) => (
                            <motion.tr
                              key={
                                (client as any)._id ?? (client as any).id ?? i
                              }
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: i * 0.05 }}
                              className="hover:bg-brand-navy/[0.01] transition-colors group"
                            >
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center font-bold text-brand-navy text-xs">
                                    {client.name?.charAt(0) || "C"}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-brand-navy">
                                      {client.name} {client.lastname1}
                                    </p>
                                    <p className="text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider">
                                      {client.dni}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-8 py-6 text-sm text-brand-navy/60">
                                {client.email || "-"}
                              </td>

                              <td className="px-8 py-6 text-sm text-brand-navy/60">
                                {client.phone || "-"}
                              </td>

                              <td className="px-8 py-6">
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-sky/10 text-brand-sky">
                                  {(client as any).status || "Activo"}
                                </span>
                              </td>

                              <td className="px-8 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <button className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy">
                                    <Edit className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          ))}

                        {activeTab === "installations" &&
                          (paginatedItems as InstallationRow[]).map(
                            (inst, i) => (
                              <motion.tr
                                key={inst.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: i * 0.05 }}
                                className="hover:bg-brand-navy/[0.01] transition-colors group"
                              >
                                <td className="px-8 py-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center font-bold text-brand-navy text-xs">
                                      {inst.nombre_instalacion?.charAt(0) ||
                                        "I"}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-brand-navy group-hover:text-brand-mint transition-colors">
                                        {inst.nombre_instalacion}
                                      </p>
                                      <div className="flex items-center gap-2 text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {formatNumber(inst.lat)},{" "}
                                        {formatNumber(inst.lng)}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-8 py-6">
                                  <div className="max-w-[320px]">
                                    <p className="text-sm text-brand-navy/70 truncate">
                                      {inst.direccion || "Sin dirección"}
                                    </p>
                                    <p className="text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
                                      Autoconsumo:{" "}
                                      {formatAutoconsumo(
                                        inst.porcentaje_autoconsumo,
                                      )}
                                    </p>
                                  </div>
                                </td>

                                <td className="px-8 py-6">
                                  <div>
                                    <p className="text-sm font-bold text-brand-navy">
                                      {formatNumber(
                                        inst.potencia_instalada_kwp,
                                      )}{" "}
                                      kWp
                                    </p>
                                    <p className="text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider mt-1">
                                      {formatNumber(inst.almacenamiento_kwh)}{" "}
                                      kWh
                                    </p>
                                  </div>
                                </td>

                                <td className="px-8 py-6">
                                  <div className="flex flex-col gap-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-sky/10 text-brand-sky w-fit">
                                      {formatModalidad(inst.modalidad)}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">
                                      {formatNumber(inst.horas_efectivas)} h/año
                                    </span>
                                  </div>
                                </td>

                                <td className="px-8 py-6">
                                  <span
                                    className={cn(
                                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                                      inst.active
                                        ? "bg-green-100 text-green-600"
                                        : "bg-red-100 text-red-600",
                                    )}
                                  >
                                    {inst.active ? "Activa" : "Inactiva"}
                                  </span>
                                </td>

                                <td className="px-8 py-6 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() =>
                                        setSelectedInstallation(inst)
                                      }
                                      className="p-3 hover:bg-brand-sky/10 rounded-xl transition-all text-brand-navy/40 hover:text-brand-sky"
                                      title="Ver detalle"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    <button
                                      onClick={() => {
                                        setEditingInstallation(inst);
                                        setShowInstallationForm(true);
                                      }}
                                      className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy"
                                      title="Editar"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>

                                    <button
                                      onClick={() =>
                                        handleDeleteInstallation(inst.id)
                                      }
                                      className="p-3 hover:bg-red-50 rounded-xl transition-all text-brand-navy/40 hover:text-red-500"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                            ),
                          )}

                        {activeTab === "documents" &&
                          (paginatedItems as any[]).map((doc, i) => (
                            <motion.tr
                              key={(doc as any)._id ?? (doc as any).id ?? i}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: i * 0.05 }}
                              className="hover:bg-brand-navy/[0.01] transition-colors group"
                            >
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-3">
                                  <FileText className="w-5 h-5 text-brand-navy/30" />
                                  <p className="text-sm font-bold text-brand-navy">
                                    {(doc as any).fileName}
                                  </p>
                                </div>
                              </td>

                              <td className="px-8 py-6 text-sm text-brand-navy/60">
                                {(doc as any).client?.name || "Sin cliente"}
                              </td>

                              <td className="px-8 py-6">
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-navy/5 text-brand-navy/40">
                                  {(doc as any).type}
                                </span>
                              </td>

                              <td className="px-8 py-6">
                                <span className="text-xs font-bold text-brand-navy/60">
                                  {(doc as any).status}
                                </span>
                              </td>

                              <td className="px-8 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <a
                                    href={(doc as any).webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  <tbody className="divide-y divide-brand-navy/5"></tbody>
                </table>
              </div>
            )}

            <div className="p-6 md:p-8 bg-brand-navy/[0.01] border-t border-brand-navy/5 flex flex-col md:flex-row md:justify-between md:items-center gap-4 mt-auto">
              <div className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest">
                Mostrando {totalItems === 0 ? 0 : startIndex + 1}-
                {Math.min(endIndex, totalItems)} de {totalItems}
                {activeTab === "studies" && " estudios"}
                {activeTab === "clients" && " clientes"}
                {activeTab === "installations" && " instalaciones"}
                {activeTab === "documents" && " documentos"}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={safeCurrentPage === 1}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                      safeCurrentPage === 1
                        ? "bg-brand-navy/5 text-brand-navy/25 border-brand-navy/5 cursor-not-allowed"
                        : "bg-white text-brand-navy border-brand-navy/10 hover:bg-brand-navy/5",
                    )}
                  >
                    Anterior
                  </button>

                  {getPaginationRange(safeCurrentPage, totalPages).map(
                    (page, index) =>
                      page === "..." ? (
                        <span
                          key={`dots-${index}`}
                          className="px-2 text-sm font-bold text-brand-navy/30"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(Number(page))}
                          className={cn(
                            "min-w-[42px] h-[42px] rounded-xl text-sm font-bold transition-all",
                            safeCurrentPage === page
                              ? "brand-gradient text-brand-navy shadow-lg shadow-brand-mint/20"
                              : "bg-white text-brand-navy border border-brand-navy/10 hover:bg-brand-navy/5",
                          )}
                        >
                          {page}
                        </button>
                      ),
                  )}

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={safeCurrentPage === totalPages}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                      safeCurrentPage === totalPages
                        ? "bg-brand-navy/5 text-brand-navy/25 border-brand-navy/5 cursor-not-allowed"
                        : "bg-white text-brand-navy border-brand-navy/10 hover:bg-brand-navy/5",
                    )}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* <div className="p-8 bg-brand-navy/[0.01] border-t border-brand-navy/5 flex justify-between items-center mt-auto">
          <p className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest">
            {activeTab === "studies" &&
              `Mostrando ${displayedStudies.length} estudios`}
            {activeTab === "clients" &&
              `Mostrando ${displayedClients.length} clientes`}
            {activeTab === "installations" &&
              `Mostrando ${displayedInstallations.length} instalaciones`}
            {activeTab === "documents" &&
              `Mostrando ${displayedDocuments.length} documentos`}
          </p>
        </div> */}
        <InstallationDetailDrawer
          installation={selectedInstallation}
          clientsCount={selectedInstallationClientsCount}
          consumedKwp={selectedInstallationConsumedKwp}
          availableKwp={selectedInstallationAvailableKwp}
          occupancyPercent={selectedInstallationOccupancy}
          associatedClients={selectedInstallationClients}
          onClose={() => setSelectedInstallation(null)}
          onSave={handleUpdateInstallation}
          onDelete={async (installationId) => {
            await handleDeleteInstallation(installationId);
            setSelectedInstallation(null);
          }}
        />
        {showInstallationForm && (
          <InstallationForm
            onClose={() => {
              setShowInstallationForm(false);
              setEditingInstallation(undefined);
            }}
            onSuccess={() => {
              setShowInstallationForm(false);
              setEditingInstallation(undefined);
              fetchTabData();
              fetchAllData();
            }}
            initialData={editingInstallation}
          />
        )}
      </div>
    </div>
  );
}
