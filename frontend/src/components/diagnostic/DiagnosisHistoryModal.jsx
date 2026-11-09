import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X, Languages, Loader2 } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useAuthStore } from "../../stores/authStore.js";
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

const hasRecordedText = (item) => typeof item === "string" && item.trim().length > 0;

function ChipList({ items, previousItems, t }) {
  const missingText = t("diagnoses.history.notRecorded");
  if (!Array.isArray(items)) return <span>{missingText}</span>;
  if (!items.length) {
    const cleared = Array.isArray(previousItems) && previousItems.some(hasRecordedText);
    return <span>{t(cleared ? "diagnoses.history.cleared" : "diagnoses.history.none")}</span>;
  }
  const arr = items.filter(hasRecordedText);
  if (!arr.length) return <span>{missingText}</span>;

  return (
    <span className="flex flex-wrap gap-1">
      {arr.map((it, i) => (
        <span key={`${it}-${i}`} className="max-w-full break-words rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700">
          {it}
        </span>
      ))}
    </span>
  );
}

function formatHistoryDate(value, language, missing) {
  if (value == null || value === "") return missing;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? missing : date.toLocaleString(language);
}

function SnapshotViewer({ snapshot, previousSnapshot, t, language, right }) {
  if (!snapshot) return <p>{t("diagnoses.history.snapshotUnavailable")}</p>;

  const none = trOr(t, "diagnoses.history.none", "None");
  const missing = t("diagnoses.history.notRecorded");
  const textValue = (value) => typeof value === "string" ? value.trim() ? value : none : missing;
  const title = textValue(snapshot.title ?? snapshot.Diagnostic ?? snapshot.diagnosis);

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-slate-700">
      <div className="col-span-full flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-1">
        <div className="min-w-0 break-words font-semibold text-slate-900">{title}</div>
        {right}
      </div>

      <div>
        <span className="font-medium text-slate-500">{t("diagnoses.history.diagnosisCreatedAt")}:</span>{" "}
        {formatHistoryDate(snapshot.createdAt, language, missing)}
      </div>
      <div>
        <span className="font-medium text-slate-500">{t("diagnoses.history.diagnosisUpdatedAt")}:</span>{" "}
        {formatHistoryDate(snapshot.updatedAt, language, missing)}
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.description")}:</span>
        <div className="mt-1 whitespace-pre-wrap break-words">{textValue(snapshot.description)}</div>
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.medicines")}:</span>{" "}
        <ChipList items={snapshot.medicine} previousItems={previousSnapshot?.medicine} t={t} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.treatments")}:</span>{" "}
        <ChipList items={snapshot.treatment} previousItems={previousSnapshot?.treatment} t={t} />
      </div>

      <div className="col-span-full">
        <span className="font-medium text-slate-500">{t("diagnoses.detail.operations")}:</span>{" "}
        <ChipList items={snapshot.operation} previousItems={previousSnapshot?.operation} t={t} />
      </div>
    </div>
  );
}

export default function DiagnosisHistoryModal(props) {
  const accountId = useAuthStore((state) => state.user?._id);
  return <HistoryPanel key={JSON.stringify([accountId, props.variant, props.childId, props.diagnosisId])} {...props} />;
}

function HistoryPanel({ diagnosisId, onClose, variant = "self", childId = null }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language || "en";
  const [expandedId, setExpandedId] = useState(null);
  const [translations, setTranslations] = useState({});

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

  const { data: history, isLoading, isFetching, isError, refetch } = isChild ? childQ : selfQ;
  const selfTranslation = useTranslateDiagnosisHistorySnapshot();
  const childTranslation = useTranslateChildDiagnosisHistorySnapshot();
  const translation = isChild ? childTranslation : selfTranslation;

  const handleTranslateSnap = (historyId, key) => {
    const payload = isChild
      ? { childId, diagnosisId, historyId, lang: language }
      : { diagnosisId, historyId, lang: language };

    translation.mutate(payload, {
      onSuccess: (version) => {
        if (version?.snapshot) setTranslations((previous) => ({ ...previous, [key]: version.snapshot }));
      },
    });
  };


  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const title = trOr(t, "diagnoses.history.title", "Diagnosis History");
  const emptyText = trOr(t, "diagnoses.history.empty", "No history versions found.");
  const loadingText = trOr(t, "common.loading", "Loading...");
  const systemUnknown = trOr(t, "diagnoses.history.systemUnknown", "System/Unknown");
  const loading = isLoading || isFetching;

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
          {loading && (
            <p role="status" className="text-center text-slate-500 py-4">{loadingText}</p>
          )}

          {!loading && isError && (
            <div className="space-y-2 py-4 text-center">
              <p role="alert">{t("diagnoses.toasts.loadHistoryFailed")}</p>
              <Button variant="secondary" full={false} onClick={() => refetch()}>
                {t("diagnoses.history.retry")}
              </Button>
            </div>
          )}

          {!loading && !isError && (!history || history.length === 0) && (
            <p className="text-center text-slate-500 py-4">{emptyText}</p>
          )}

          <div className="space-y-3">
            {!loading && !isError && history?.map((ver, index) => {
              const missing = t("diagnoses.history.notRecorded");
              const when = formatHistoryDate(ver.createdAt, language, missing);
              const created = ver.changeType === "created";
              const action = created ? t("diagnoses.history.created")
                : ver.changeType === "updated" ? t("diagnoses.history.updated") : missing;
              const actorLabel = t(created ? "diagnoses.history.createdBy" : "diagnoses.history.editedBy");

              const name = ver?.editedBy?.name || "";
              const email = ver?.editedBy?.email || "";
              const editedBy = name && email ? `${name} (${email})` : name || email || systemUnknown;

              const key = JSON.stringify([ver._id, language]);
              const translated = translations[key];
              const snap = translated ?? ver.snapshot;
              const translating = translation.isPending && translation.variables?.historyId === ver._id
                && translation.variables?.lang === language;
              const translationLabel = t(translated ? "diagnoses.history.translated" : "common.translate");
              const expanded = expandedId === ver._id;
              const panelId = `diagnosis-history-version-${ver._id}`;

              return (
                <div key={ver._id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => toggle(ver._id)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <div className="min-w-0 break-words">
                      <p className="font-medium text-slate-800">{action} · {when}</p>
                      <p className="text-xs text-slate-500">
                        {actorLabel}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                      {expanded
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                  {expanded && (
                    <div id={panelId} className="border-t border-slate-200 bg-white p-4">
                      <SnapshotViewer
                        snapshot={snap}
                        previousSnapshot={history[index + 1]?.snapshot}
                        t={t}
                        language={language}
                        right={(
                          <button
                            type="button"
                            onClick={() => handleTranslateSnap(ver._id, key)}
                            disabled={translating || Boolean(translated)}
                            aria-busy={translating}
                            aria-label={translationLabel}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            title={translationLabel}
                          >
                            {translating ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Languages className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        )}
                      />
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
