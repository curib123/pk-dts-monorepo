export function systemWorkflowKey(documentType: string, action?: string) {
  return documentType === "HARDCOPY" && action === "TRANSFER" ? "system-hardcopy-transfer"
    : documentType === "HARDCOPY" ? "system-hardcopy-direct-approval"
    : action === "CANCELLATION" ? "system-softcopy-cancellation" : "system-softcopy-standard";
}
