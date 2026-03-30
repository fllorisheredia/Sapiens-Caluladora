import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import Layout from "../components/shared/Layout";
import Button from "../components/ui/Button";
import { Loader2, CheckCircle2, AlertTriangle, CreditCard } from "lucide-react";
import { formatCurrency } from "../lib/utils";

type CheckoutStatusResponse = {
  success: boolean;
  waitingWebhook?: boolean;
  session?: {
    id: string;
    status: string;
    paymentStatus: string | null;
    customerEmail: string | null;
  };
  reservation?: {
    id: string;
    contractId: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string | null;
    confirmedAt: string | null;
    releasedAt: string | null;
    signalAmount: number;
    currency: string;
  } | null;
  contract?: {
    id: string;
    contractNumber: string;
    status: string;
    contractUrl: string | null;
  } | null;
};

export default function ReservationConfirmedPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";
  const contractIdFromUrl = searchParams.get("contractId") || "";

  const [data, setData] = useState<CheckoutStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("Falta el session_id del pago.");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await axios.get<CheckoutStatusResponse>(
          "/api/stripe/checkout-session-status",
          {
            params: {
              session_id: sessionId,
              contractId: contractIdFromUrl,
            },
          },
        );

        if (cancelled) return;

        setData(response.data);
        setError(null);

        const shouldPoll =
          response.data?.waitingWebhook === true && attemptsRef.current < 8;

        if (shouldPoll) {
          attemptsRef.current += 1;
          timer = setTimeout(loadStatus, 1500);
        }
      } catch (err: any) {
        if (cancelled) return;

        setError(
          err?.response?.data?.details ||
            err?.response?.data?.error ||
            err?.message ||
            "No se pudo comprobar el estado del pago.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, contractIdFromUrl]);

  const handleRetryPayment = async () => {
    const contractId = data?.contract?.id;

    if (!contractId) return;

    setRetryingPayment(true);

    try {
      const response = await axios.post(`/api/contracts/${contractId}/retry-payment`);
      const checkoutUrl = response.data?.stripe?.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error("No se recibió la nueva URL de pago.");
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
      setRetryingPayment(false);
    }
  };

  const isPaid = data?.reservation?.paymentStatus === "paid";
  const isPending =
    data?.session?.status === "complete" &&
    data?.reservation?.paymentStatus !== "paid";

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white rounded-[2rem] border border-brand-navy/5 shadow-xl p-8 md:p-10">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-navy mb-4" />
              <h1 className="text-2xl font-bold text-brand-navy">
                Comprobando tu pago
              </h1>
              <p className="text-brand-gray mt-3">
                Estamos validando el estado de tu reserva.
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
              <h1 className="text-2xl font-bold text-brand-navy">
                No se pudo comprobar el pago
              </h1>
              <p className="text-brand-gray mt-3">{error}</p>
            </div>
          ) : isPaid ? (
            <div className="text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500 mb-4" />
              <h1 className="text-3xl font-bold text-brand-navy">
                Pago completado correctamente
              </h1>
              <p className="text-brand-gray mt-3 max-w-xl mx-auto">
                Tu señal ha sido registrada y la reserva ha quedado confirmada.
              </p>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                  <p className="text-xs uppercase tracking-widest font-bold text-brand-navy/40 mb-1">
                    Contrato
                  </p>
                  <p className="font-bold text-brand-navy">
                    {data?.contract?.contractNumber || "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                  <p className="text-xs uppercase tracking-widest font-bold text-brand-navy/40 mb-1">
                    Señal abonada
                  </p>
                  <p className="font-bold text-brand-navy">
                    {data?.reservation
                      ? formatCurrency(data.reservation.signalAmount)
                      : "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                  <p className="text-xs uppercase tracking-widest font-bold text-brand-navy/40 mb-1">
                    Estado de la reserva
                  </p>
                  <p className="font-bold text-brand-navy">
                    {data?.reservation?.reservationStatus || "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                  <p className="text-xs uppercase tracking-widest font-bold text-brand-navy/40 mb-1">
                    Estado del pago
                  </p>
                  <p className="font-bold text-brand-navy">
                    {data?.reservation?.paymentStatus || "-"}
                  </p>
                </div>
              </div>

              {data?.contract?.contractUrl ? (
                <div className="mt-8">
                  <a
                    href={data.contract.contractUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="px-8 py-5 rounded-2xl brand-gradient text-brand-navy border-none">
                      Ver precontrato
                    </Button>
                  </a>
                </div>
              ) : null}
            </div>
          ) : isPending ? (
            <div className="text-center py-6">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-brand-navy mb-4" />
              <h1 className="text-2xl font-bold text-brand-navy">
                Estamos confirmando tu pago
              </h1>
              <p className="text-brand-gray mt-3">
                Stripe ya nos ha devuelto correctamente. Solo falta terminar la
                confirmación interna de la reserva.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <CreditCard className="w-12 h-12 mx-auto text-brand-navy mb-4" />
              <h1 className="text-2xl font-bold text-brand-navy">
                El pago no está completado
              </h1>
              <p className="text-brand-gray mt-3 max-w-lg mx-auto">
                Tu reserva existe, pero la señal todavía no figura como pagada.
                Puedes reintentar el pago ahora.
              </p>

              <div className="mt-8">
                <Button
                  onClick={handleRetryPayment}
                  disabled={retryingPayment || !data?.contract?.id}
                  className="px-8 py-5 rounded-2xl brand-gradient text-brand-navy border-none"
                >
                  {retryingPayment ? (
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  ) : null}
                  Reintentar pago
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}