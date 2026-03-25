import axios from "axios";

type ConfirmStudyParams = {
  invoiceFile: File;
  proposalFile: File;
  customer: Record<string, unknown>;
  location?: Record<string, unknown> | null;
  invoiceData?: Record<string, unknown> | null;
  calculation?: unknown;
  selectedInstallationId?: string | null;
  selectedInstallationSnapshot?: unknown;
  language?: string;
  consentAccepted?: boolean;
  status?: string;
  assignedKwp?: number;
  
};

export async function confirmStudy({
  invoiceFile,
  proposalFile,
  customer,
  location,
  invoiceData,
  calculation,
  selectedInstallationId,
  selectedInstallationSnapshot,
  language = "ES",
  consentAccepted = true,
  status = "uploaded",
}: ConfirmStudyParams) {
const formData = new FormData();
formData.append("invoice", invoiceFile);
formData.append("proposal", proposalFile);
formData.append("customer", JSON.stringify(customer ?? {}));
formData.append("location", JSON.stringify(location ?? {}));
formData.append("invoice_data", JSON.stringify(invoiceData ?? {}));
formData.append("calculation", JSON.stringify(calculation ?? {}));
formData.append(
  "selected_installation_snapshot",
  JSON.stringify(selectedInstallationSnapshot ?? {}),
);

if (selectedInstallationId) {
  formData.append("selected_installation_id", selectedInstallationId);
}

formData.append("language", language);
formData.append("consent_accepted", String(consentAccepted));

const { data } = await axios.post("/api/confirm-study", formData, {
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

return data;
}