import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X, Languages, Loader2 } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useDiagnosisHistory, useTranslateDiagnosisHistorySnapshot, useMyChildDiagnosisHistory,
  useTranslateChildDiagnosisHistorySnapshot, } from "../../features/diagnostics/dhooks.js";

const trOr = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const trapPanelFocus = (e, panel) => {
  if (e.key !== "Tab") return;

  const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));

  if (!focusable.length) {
    e.preventDefault();
    panel.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!focusable.includes(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }

  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
    return;
  }

  if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
};

function ChipList({ items, noneText }) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return <span>{noneText}</span>;

  return (
    <span className="flex flex-wrap gap-1">
      {arr.map((it, i) => (
        <span key={`${it}-${i}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700">
          {it}
        </span>
      ))}
    </span>
  );
}

function SnapshotViewer({ snapshot, t, right }) {
  if (!snapshot) return null;

  const none = trOr(t, "diagnoses.history.none", "None");
  const title = snapshot.title ?? snapshot.Diagnostic ?? snapshot.diagnosis ?? trOr(t, "diagnoses.detail.untitled", "Untitled");

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-slate-700">
      <div className="col-span-full flex items-center justify-between border-b border-slate-100 pb-2 mb-1">
      <div className="font-semibold text-slate-900">{title}</div>
        {right}
      </div>


      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.description")}:</span>
        <div className="mt-1 whitespace-pre-line">{snapshot.description?.trim() || "—"}</div>
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.medicines")}:</span>{" "}
        <ChipList items={snapshot.medicine} noneText={none} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.treatments")}:</span>{" "}
        <ChipList items={snapshot.treatment} noneText={none} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.operations")}:</span>{" "}
        <ChipList items={snapshot.operation} noneText={none} />
      </div>
    </div>
  );
}

export default function DiagnosisHistoryModal({ diagnosisId, onClose,  variant = "self", childId = null, }) {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState(null);
  const [translatedById, setTranslatedById] = useState({});
  const [translatingId, setTranslatingId] = useState(null);

  const panelRef = useRef(null);

  useEffect(() => {
    const previousActive = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previousActive && typeof previousActive.focus === "function") {
        previousActive.focus();
      }
    };
  }, []);


    const isChild = variant === "child";

  const selfQ = useDiagnosisHistory(diagnosisId, {
    enabled: !isChild && !!diagnosisId,
  });

  const childQ = useMyChildDiagnosisHistory(childId, diagnosisId, {
    enabled: isChild && !!childId && !!diagnosisId,
  });

  const history = isChild ? childQ.data : selfQ.data;
  const isLoading = isChild ? childQ.isLoading : selfQ.isLoading;

  const { mutate: translateSnap } = useTranslateDiagnosisHistorySnapshot();
  const { mutate: translateChildSnap } = useTranslateChildDiagnosisHistorySnapshot();


    const handleTranslateSnap = (historyId) => {
    if (translatedById[historyId]?.lang === i18n.language) return;

    const isChild = variant === "child";
    const mut = isChild ? translateChildSnap : translateSnap;

    const payload = isChild
      ? { childId, diagnosisId, historyId, lang: i18n.language }
      : { diagnosisId, historyId, lang: i18n.language };

    setTranslatingId(historyId);

    mut(payload, {
      onSuccess: (ver) => {
        setTranslatedById((prev) => ({
          ...prev,
          [historyId]: { lang: i18n.language, snapshot: ver.snapshot },
        }));
      },
      onSettled: () => setTranslatingId(null),
    });
  };


  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const title = trOr(t, "diagnoses.history.title", "Diagnosis History");
  const emptyText = trOr(t, "diagnoses.history.empty", "No history versions found.");
  const loadingText = trOr(t, "common.loading", "Loading...");
  const actorLabel = trOr(t, "diagnoses.history.editedBy", "Edited by");
  const systemUnknown = trOr(t, "diagnoses.history.systemUnknown", "System/Unknown");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnosis-history-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          trapPanelFocus(e, e.currentTarget);
        }}
        className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 id="diagnosis-history-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <History className="h-5 w-5" aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={trOr(t, "common.close", "Close")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-slate-500 py-4">{loadingText}</p>
          )}

          {!isLoading && (!history || history.length === 0) && (
            <p className="text-center text-slate-500 py-4">{emptyText}</p>
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
                <div key={ver._id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => toggle(ver._id)}
                    className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{action} · {when}</p>
                      <p className="text-xs text-slate-500">
                        {actorLabel}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                  {expandedId === ver._id && (
  <div className="border-t border-slate-200 bg-white p-4">
    {(() => {
      const translated = translatedById[ver._id];
      const snapToShow =
        translated?.lang === i18n.language ? translated.snapshot : snap;

      const loading = translatingId === ver._id;
      const already = translated?.lang === i18n.language;

      return (
        <SnapshotViewer
          snapshot={snapToShow}
          t={t}
          right={
            <button
              type="button"
              onClick={() => handleTranslateSnap(ver._id)}
              disabled={loading || already}
              aria-label={already ? "Translated" : "Translate"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              title={already ? "Translated" : "Translate"}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Languages className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          }
        />
      );
    })()}
  </div>
)}

                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 p-3">
          <Button variant="secondary" full={false} onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
