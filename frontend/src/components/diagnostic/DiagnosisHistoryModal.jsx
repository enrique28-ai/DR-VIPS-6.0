import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useDiagnosisHistory } from "../../features/diagnostics/dhooks.js";

const trOr = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
};

function ChipList({ items, noneText }) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return <span>{noneText}</span>;

  return (
    <span className="flex flex-wrap gap-1">
      {arr.map((it, i) => (
        <span key={`${it}-${i}`} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">
          {it}
        </span>
      ))}
    </span>
  );
}

function SnapshotViewer({ snapshot, t }) {
  if (!snapshot) return null;

  const none = trOr(t, "diagnoses.history.none", "None");
  const title = snapshot.title ?? snapshot.Diagnostic ?? snapshot.diagnosis ?? trOr(t, "diagnoses.detail.untitled", "Untitled");

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-gray-700">
      <div className="col-span-full font-semibold text-gray-900 border-b pb-2 mb-1">
        {title}
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("diagnoses.detail.description")}:</span>
        <div className="mt-1 whitespace-pre-line">{snapshot.description?.trim() || "—"}</div>
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("diagnoses.detail.medicines")}:</span>{" "}
        <ChipList items={snapshot.medicine} noneText={none} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("diagnoses.detail.treatments")}:</span>{" "}
        <ChipList items={snapshot.treatment} noneText={none} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("diagnoses.detail.operations")}:</span>{" "}
        <ChipList items={snapshot.operation} noneText={none} />
      </div>
    </div>
  );
}

export default function DiagnosisHistoryModal({ diagnosisId, onClose }) {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState(null);

  const { data: history, isLoading } = useDiagnosisHistory(diagnosisId, {
    enabled: !!diagnosisId,
  });

  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const title = trOr(t, "diagnoses.history.title", "Diagnosis History");
  const emptyText = trOr(t, "diagnoses.history.empty", "No history versions found.");
  const loadingText = trOr(t, "common.loading", "Loading...");
  const actorLabel = trOr(t, "diagnoses.history.editedBy", "Edited by");
  const systemUnknown = trOr(t, "diagnoses.history.systemUnknown", "System/Unknown");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <History className="h-5 w-5" />
            {title}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-gray-500 py-4">{loadingText}</p>
          )}

          {!isLoading && (!history || history.length === 0) && (
            <p className="text-center text-gray-500 py-4">{emptyText}</p>
          )}

          <div className="space-y-3">
            {history?.map((ver) => {
              const when = ver?.createdAt
                ? new Date(ver.createdAt).toLocaleString(i18n.language || undefined)
                : "—";

              const action =
                ver?.changeType === "created"
                  ? trOr(t, "diagnoses.history.created", "Created")
                  : trOr(t, "diagnoses.history.updated", "Updated");

              const name = ver?.editedBy?.name || "";
              const email = ver?.editedBy?.email || "";
              const editedBy = name && email ? `${name} (${email})` : name || email || systemUnknown;

              const snap = ver?.snapshot || null;

              return (
                <div key={ver._id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    onClick={() => toggle(ver._id)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{action} · {when}</p>
                      <p className="text-xs text-gray-500">
                        {actorLabel}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                  {expandedId === ver._id && (
                    <div className="border-t border-gray-200 bg-white p-4">
                      <SnapshotViewer snapshot={snap} t={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
