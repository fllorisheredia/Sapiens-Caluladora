import type { StudyData, StudyStatus, EmailStatus } from "../server/models/Study";

function getCustomerFullName(study: StudyData): string {
  const name = study.customer?.name?.trim() || "";
  const lastName = study.customer?.lastName?.trim() || "";
  return `${name} ${lastName}`.trim() || "Sin nombre";
}

function getStudyAddress(study: StudyData): string {
  return (
    study.location?.address ||
    [
      study.location?.street,
      study.location?.city,
      study.location?.province,
      study.location?.postalCode,
    ]
      .filter(Boolean)
      .join(", ") ||
    study.customer?.address ||
    "-"
  );
}

function getInstallationName(study: StudyData): string {
  return (
    study.selected_installation_snapshot?.installationName ||
    study.selected_installation_snapshot?.installationData?.nombre_instalacion ||
    "Sin instalación"
  );
}

function formatStudyStatus(status?: StudyStatus): string {
  switch (status) {
    case "uploaded":
      return "Subido";
    case "validated":
      return "Validado";
    case "location_selected":
      return "Ubicación seleccionada";
    case "calculating":
      return "Calculando";
    case "completed":
      return "Completado";
    case "error":
      return "Error";
    default:
      return "Desconocido";
  }
}

function formatEmailStatus(status?: EmailStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "sent":
      return "Enviado";
    case "failed":
      return "Fallido";
    default:
      return "Pendiente";
  }
}

function formatCurrency(value?: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}