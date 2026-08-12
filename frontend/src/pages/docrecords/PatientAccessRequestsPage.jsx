import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Inbox,
  Loader2,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import {
  useApprovePatientAccessRequest,
  useMyPatientAccessRequests,
  useRejectPatientAccessRequest,
} from "../../features/patients/phooks.js";

function PageShell({ children, ...props }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" {...props}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function PageHeader({ t }) {
  return (
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
          <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
          {t("navbar.accessRequests")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          {t("accessRequests.title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          {t("accessRequests.description")}
        </p>
      </div>
    </header>
  );
}

function LoadingState({ t }) {
  return (
    <PageShell aria-busy="true">
      <PageHeader t={t} />
      <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
        {t("accessRequests.loading")}
      </p>
      <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm"
          />
        ))}
      </div>
    </PageShell>
  );
}

function EmptyState({ t }) {
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
        {t("accessRequests.emptyTitle")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        {t("accessRequests.emptyDescription")}
      </p>
    </section>
  );
}

function ErrorState({ isRetrying, onRetry, t }) {
  return (
    <section
      role="alert"
      className="rounded-3xl border border-red-200 bg-white px-6 py-12 text-center shadow-sm"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
        <TriangleAlert className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
        {t("accessRequests.loadFailed")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        {t("accessRequests.loadFailedDescription")}
      </p>
      <Button className="mt-6 sm:w-auto" onClick={onRetry} loading={isRetrying}>
        {t("accessRequests.retry")}
      </Button>
    </section>
  );
}

function formatRequestDate(value, language, fallback) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function RequestCard({ decision, onApprove, onReject, request, t, language }) {
  const requestId = request?._id;
  const isDeciding = Boolean(decision);
  const doctorName = request?.doctor?.name || t("accessRequests.unknownDoctor");
  const doctorEmail = request?.doctor?.email || t("accessRequests.emailUnavailable");
  const patientName = request?.patient?.fullname || t("accessRequests.recordUnavailable");
  const requestedDate = formatRequestDate(
    request?.createdAt,
    language,
    t("accessRequests.dateUnavailable"),
  );
  const headingId = `access-request-${requestId}-doctor`;
  const consequenceId = `access-request-${requestId}-consequence`;

  return (
    <article
      aria-labelledby={headingId}
      aria-busy={isDeciding}
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/70" aria-hidden="true" />
      <div className="min-w-0 pl-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("accessRequests.doctor")}
            </p>
            <h2
              id={headingId}
              className="mt-1 break-words text-lg font-semibold leading-tight text-slate-950"
            >
              {doctorName}
            </h2>
            <p className="mt-1 break-all text-sm leading-6 text-slate-600">{doctorEmail}</p>
          </div>
          <span className="inline-flex min-h-9 shrink-0 items-center gap-2 self-start rounded-full bg-amber-50 px-3 text-sm font-semibold text-amber-800">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {t("accessRequests.pending")}
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("accessRequests.medicalRecord")}
          </p>
          <p className="mt-1 break-words text-base font-semibold text-slate-900">{patientName}</p>
        </div>

        <p id={consequenceId} className="mt-4 text-sm leading-6 text-slate-600">
          {t("accessRequests.approvalConsequence", {
            doctor: doctorName,
            patient: patientName,
          })}
        </p>

        <p className="mt-3 text-sm text-slate-600">
          {t("accessRequests.requestedAt")}{" "}
          <time dateTime={request?.createdAt || undefined} className="font-medium text-slate-800">
            {requestedDate}
          </time>
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => onReject(requestId)}
            disabled={isDeciding}
            loading={decision === "reject"}
            aria-describedby={consequenceId}
          >
            {decision === "reject" ? t("accessRequests.rejecting") : t("accessRequests.reject")}
          </Button>
          <Button
            onClick={() => onApprove(requestId)}
            disabled={isDeciding}
            loading={decision === "approve"}
            aria-describedby={consequenceId}
          >
            {decision === "approve" ? t("accessRequests.approving") : t("accessRequests.approve")}
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function PatientAccessRequestsPage() {
  const { t, i18n } = useTranslation();
  const [decisions, setDecisions] = useState({});
  const { data, isLoading, isError, isFetching, refetch } = useMyPatientAccessRequests();
  const approveMutation = useApprovePatientAccessRequest();
  const rejectMutation = useRejectPatientAccessRequest();

  const decide = async (requestId, action) => {
    setDecisions((current) => ({ ...current, [requestId]: action }));
    const mutation = action === "approve" ? approveMutation : rejectMutation;
    try {
      await mutation.mutateAsync(requestId);
    } catch {
      // The hook owns safe, localized error reporting.
    } finally {
      setDecisions((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    }
  };

  if (isLoading) return <LoadingState t={t} />;

  const accessRequests = Array.isArray(data?.accessRequests) ? data.accessRequests : [];

  return (
    <PageShell>
      <PageHeader t={t} />
      {isError ? (
        <ErrorState isRetrying={isFetching} onRetry={refetch} t={t} />
      ) : accessRequests.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <section aria-label={t("accessRequests.pendingRequests")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {accessRequests.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                decision={decisions[request._id]}
                onApprove={(requestId) => decide(requestId, "approve")}
                onReject={(requestId) => decide(requestId, "reject")}
                t={t}
                language={i18n.language}
              />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}
