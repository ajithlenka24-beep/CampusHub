import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import { Button, ConfirmModal, EmptyState, PageHead, PageLoading, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage } from "../services/api";
import type { Application, ApplicationStatus } from "../types";
import { STATUS_LABELS, TYPE_LABELS, formatDate, formatDateTime } from "../utils/format";

const STAGES: ApplicationStatus[] = ["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED"];

export default function ApplicationsPage() {
  const { data, loading, error, reload } = useApi<{ applications: Application[] }>("/applications");
  const [filter, setFilter] = useState<ApplicationStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<Application | null>(null);
  const [withdrawing, setWithdrawing] = useState<Application | null>(null);
  const toast = useToast();

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error}</div>;
  const apps = data.applications;
  const counts = apps.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  const shown = filter === "ALL" ? apps : apps.filter((a) => a.status === filter);

  return (
    <div>
      <PageHead title="Application Tracker" subtitle="Status updates are made by administrators. You'll get a notification for every change." actions={<Link className="btn btn-primary" to="/opportunities">Find opportunities</Link>} />
      <div className="tabs" role="tablist">
        <button type="button" className={`tab ${filter === "ALL" ? "active" : ""}`} onClick={() => setFilter("ALL")}>All ({apps.length})</button>
        {(["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"] as ApplicationStatus[]).filter((s) => counts[s]).map((s) => (
          <button key={s} type="button" className={`tab ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{STATUS_LABELS[s]} ({counts[s]})</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="clipboard" title="No applications here yet"><Link className="btn btn-primary btn-sm" to="/opportunities">Browse opportunities</Link></EmptyState>
      ) : (
        <div className="tracker-list">
          {shown.map((a) => (
            <article key={a.id} className={`tracker-item status-${a.status}`} style={{ cursor: "pointer" }} onClick={() => setSelected(a)}>
              <div className="tracker-info">
                <h3 className="tracker-role">{a.opportunity.title}</h3>
                <p className="tracker-org">{a.opportunity.organization} · {TYPE_LABELS[a.opportunity.type]} · Applied {formatDate(a.createdAt)}</p>
              </div>
              <div className="tracker-status"><StatusBadge status={a.status} /></div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <Modal open size="lg" title={selected.opportunity.title} subtitle={`${selected.opportunity.organization} · applied ${formatDate(selected.createdAt)}`} onClose={() => setSelected(null)}
          footer={<>
            {["APPLIED", "SHORTLISTED", "INTERVIEW"].includes(selected.status) && <Button className="btn-danger" onClick={() => setWithdrawing(selected)}>Withdraw application</Button>}
            <Link className="btn btn-secondary" to={`/opportunities/${selected.opportunity.id}`}>View opportunity</Link>
          </>}>
          <div className="stack-lg">
            <div className="kv">
              <div><span className="k">Current status</span><span className="v"><StatusBadge status={selected.status} /></span></div>
              <div><span className="k">Match when applied</span><span className="v">{selected.matchScoreAtApply}%</span></div>
              <div><span className="k">Deadline</span><span className="v">{formatDate(selected.opportunity.deadline)}</span></div>
            </div>
            <div>
              <div className="card-title-gold" style={{ marginBottom: 12 }}>Progress</div>
              <div className="stepper" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 0 }}>
                {STAGES.map((s, i) => {
                  const reached = STAGES.indexOf(selected.status) >= i || selected.history.some((h) => h.toStatus === s);
                  return <div key={s} className={`step ${selected.status === s ? "active" : reached ? "done" : ""}`}><span className="num">{reached ? "✓" : i + 1}</span>{STATUS_LABELS[s]}</div>;
                })}
              </div>
            </div>
            <div>
              <div className="card-title-gold" style={{ marginBottom: 12 }}>Status history</div>
              <div className="timeline">
                {selected.history.map((h) => (
                  <div key={h.id} className={`timeline-item status-${h.toStatus}`}>
                    <strong>{STATUS_LABELS[h.toStatus]}</strong> <span className="faint small">· {formatDateTime(h.createdAt)}</span>
                    {h.note && <div className="muted small">{h.note}</div>}
                  </div>
                ))}
              </div>
            </div>
            {selected.coverNote && <div><div className="card-title-gold" style={{ marginBottom: 8 }}>Your cover note</div><p className="muted">{selected.coverNote}</p></div>}
          </div>
        </Modal>
      )}
      <ConfirmModal open={Boolean(withdrawing)} title="Withdraw application?" message="The organisers will no longer consider this application. You can't re-apply to the same opportunity." confirmLabel="Withdraw" danger onClose={() => setWithdrawing(null)}
        onConfirm={async () => {
          try {
            await api.post(`/applications/${withdrawing!.id}/withdraw`);
            toast("Application withdrawn.", "info");
            setSelected(null);
            await reload();
          } catch (e) {
            toast(errorMessage(e), "error");
          }
          setWithdrawing(null);
        }} />
    </div>
  );
}
