import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { sileo } from "sileo";
import {
  ArrowRight,
  FileText,
  IdCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

type ProposalMode = "investment" | "service";

export default function ContinuarContratacionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [selectedMode, setSelectedMode] = useState<ProposalMode>("investment");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      sileo.error({
        title: "Enlace no válido",
        description: "No se ha encontrado el token de acceso.",
      });
      return;
    }

    if (!dni.trim() || !nombre.trim() || !apellidos.trim()) {
      sileo.error({
        title: "Faltan datos",
        description: "Debes completar DNI, nombre y apellidos.",
      });
      return;
    }

    setLoading(true);
try {
  const { data } = await axios.post(
    "/api/contracts/proposal-access/validate",
    {
      token,
      dni: dni.trim().toUpperCase(),
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
    },
  );

  if (!data?.success || !data?.resumeToken) {
    throw new Error("No se pudo validar el acceso");
  }

  sessionStorage.setItem("proposal_resume_token", data.resumeToken);

  sileo.success({
    title: "Acceso validado",
    description: "Vamos a continuar con tu contratación.",
  });

  navigate(
    `/contratacion-desde-propuesta?resume=${encodeURIComponent(
      data.resumeToken,
    )}&mode=${encodeURIComponent(selectedMode)}`,
  );
} catch (error: any) {
  const message =
    error?.response?.data?.error ||
    error?.response?.data?.details ||
    "No se pudo validar tu acceso.";

  sileo.error({
    title: "No se pudo continuar",
    description: message,
  });
} finally {
  setLoading(false);
}
  };

  const modeCards = [
    {
      id: "investment" as ProposalMode,
      title: "Inversión",
      subtitle: "Mayor rentabilidad a largo plazo",
      icon: Wallet,
      description:
        "Ideal si quieres maximizar el ahorro y asumir la inversión inicial.",
    },
    {
      id: "service" as ProposalMode,
      title: "Servicio",
      subtitle: "Menor barrera de entrada",
      icon: Zap,
      description:
        "Ideal si prefieres una cuota mensual y evitar el desembolso inicial.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />

      <div className="relative z-10 px-4 py-8 md:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-8 items-start">
            <div className="rounded-[2.5rem] border border-brand-navy/5 bg-brand-navy text-white p-7 md:p-8 shadow-2xl shadow-brand-navy/15 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-brand-mint/20 blur-3xl rounded-full -mr-16 -mt-16" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                  <Sparkles className="h-4 w-4" />
                  Continuar contratación
                </div>

                <h1 className="mt-5 text-3xl md:text-4xl font-black leading-tight">
                  Retoma tu propuesta
                  <br />
                  cuando quieras
                </h1>

                <p className="mt-4 text-sm leading-6 text-white/75">
                  Accede con tus datos para continuar la contratación desde la
                  propuesta que te enviamos por correo y selecciona la modalidad
                  con la que deseas seguir.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Acceso seguro</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          Validamos tus datos antes de continuar con la
                          contratación.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Modalidad a elegir</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          Podrás continuar por inversión o por servicio y
                          generar el contrato según la opción elegida.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Proceso rápido</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          Tras validar el acceso irás directamente al flujo de
                          contratación.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-[1.4rem] bg-white/10 border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                    Estado del enlace
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {token ? "Token detectado correctamente" : "Falta token"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-brand-navy/5 bg-white p-6 md:p-8 shadow-2xl shadow-brand-navy/5">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-mint/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy">
                  <Sparkles className="h-4 w-4 text-brand-mint" />
                  Acceso a propuesta
                </div>

                <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight text-brand-navy">
                  Confirma tus datos
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-gray">
                  Introduce los datos del titular y selecciona la modalidad con
                  la que deseas continuar la contratación.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-7">
                <div className="space-y-3">
                  <p className="text-sm font-bold text-brand-navy">
                    Modalidad a contratar
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {modeCards.map((mode) => {
                      const Icon = mode.icon;
                      const isActive = selectedMode === mode.id;

                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setSelectedMode(mode.id)}
                          className={`rounded-[1.7rem] border p-5 text-left transition-all ${
                            isActive
                              ? "border-brand-mint bg-[linear-gradient(135deg,rgba(87,217,211,0.18),rgba(148,194,255,0.18))] shadow-lg shadow-brand-mint/10"
                              : "border-brand-navy/5 bg-white hover:border-brand-mint/40 hover:shadow-md"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                  isActive
                                    ? "bg-brand-navy text-white"
                                    : "bg-brand-navy/5 text-brand-navy"
                                }`}
                              >
                                <Icon className="h-6 w-6" />
                              </div>

                              <div>
                                <p className="text-lg font-bold text-brand-navy">
                                  {mode.title}
                                </p>
                                <p className="text-xs font-semibold text-brand-gray">
                                  {mode.subtitle}
                                </p>
                              </div>
                            </div>

                            <div
                              className={`mt-1 h-5 w-5 rounded-full border-2 ${
                                isActive
                                  ? "border-brand-navy bg-brand-navy"
                                  : "border-brand-navy/20"
                              }`}
                            >
                              {isActive ? (
                                <div className="flex h-full w-full items-center justify-center text-white text-[10px]">
                                  ✓
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-6 text-brand-gray">
                            {mode.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      DNI
                    </label>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={dni}
                        onChange={(e) => setDni(e.target.value.toUpperCase())}
                        placeholder="12345678A"
                        className="w-full rounded-2xl border border-brand-navy/10 bg-white px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      Nombre
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full rounded-2xl border border-brand-navy/10 bg-white px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      Apellidos
                    </label>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={apellidos}
                        onChange={(e) => setApellidos(e.target.value)}
                        placeholder="Tus apellidos"
                        className="w-full rounded-2xl border border-brand-navy/10 bg-white px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-brand-mint/15 flex items-center justify-center text-brand-navy shrink-0">
                      {selectedMode === "investment" ? (
                        <Wallet className="h-5 w-5" />
                      ) : (
                        <Zap className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-bold text-brand-navy">
                        Modalidad seleccionada:{" "}
                        {selectedMode === "investment"
                          ? "Inversión"
                          : "Servicio"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-brand-gray">
                        Continuarás el flujo con esta modalidad para generar el
                        contrato correspondiente.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group mt-2 inline-flex w-full items-center justify-center rounded-[1.4rem] brand-gradient px-5 py-4 text-base font-bold text-brand-navy shadow-lg shadow-brand-mint/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      Validando acceso...
                    </>
                  ) : (
                    <>
                      Continuar contratación
                      <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}