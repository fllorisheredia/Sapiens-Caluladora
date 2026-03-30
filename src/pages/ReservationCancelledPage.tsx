import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import Layout from "../components/shared/Layout";
import Button from "../components/ui/Button";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ReservationCancelledPage() {
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get("contractId") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetryPayment = async () => {
    if (!contractId) {
      setError("No se ha recibido el contractId.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`/api/contracts/${contractId}/retry-payment`);
      const checkoutUrl = response.data?.stripe?.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error("No se pudo recuperar la URL de pago.");
      }

      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(
        err?.response?.data?.details ||
          err?.response?.data?.error ||
          err?.message ||
          "No se pudo reintentar el pago.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white rounded-[2rem] border border-brand-navy/5 shadow-xl p-8 md:p-10 text-center">
          <AlertTriangle className="w-14 h-14 mx-auto text-amber-500 mb-4" />
          <h1 className="text-3xl font-bold text-brand-navy">
            Pago cancelado
          </h1>
          <p className="text-brand-gray mt-3 max-w-lg mx-auto">
            No pasa nada. Tu precontrato ya existe, pero la señal no se ha
            completado todavía.
          </p>

          {error ? (
            <p className="text-sm text-red-500 mt-4">{error}</p>
          ) : null}

          <div className="mt-8">
            <Button
              onClick={handleRetryPayment}
              disabled={loading || !contractId}
              className="px-8 py-5 rounded-2xl brand-gradient text-brand-navy border-none"
            >
              {loading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : null}
              Reintentar pago
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}