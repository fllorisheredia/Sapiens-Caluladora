import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { sileo } from "sileo";

export default function ContinuarContratacionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
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
          dni,
          nombre,
          apellidos,
        },
      );

      if (!data?.success || !data?.resumeToken) {
        throw new Error("No se pudo validar el acceso");
      }

      sileo.success({
        title: "Acceso validado",
        description: "Vamos a continuar con tu contratación.",
      });

      navigate(
        `/contratacion-desde-propuesta?resume=${encodeURIComponent(
          data.resumeToken,
        )}`,
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <p className="mb-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">
            Continuar contratación
          </p>

          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Accede a tu propuesta
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Introduce tus datos para continuar con la contratación desde la
            propuesta que te hemos enviado.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              DNI
            </label>
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="12345678A"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Apellidos
            </label>
            <input
              type="text"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Tus apellidos"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Validando acceso..." : "Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}