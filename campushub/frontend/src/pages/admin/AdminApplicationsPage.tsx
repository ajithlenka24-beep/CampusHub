import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Button, ErrorAlert, Field, PageHead, PageLoading, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useApi } from "../../hooks/useApi";
import { api, errorMessage } from "../../services/api";
import type { ApplicationStatus, HistoryEntry } from "../../types";
import { STATUS_LABELS, formatDate, formatDateTime } from "../../utils/format";

interface Row { id: string; status: ApplicationStatus; createdAt: string; updatedAt: string; matchScoreAtApply: number; studentName: string; studentEmail: string; opportunityTitle: string; organization: string }
interface Detail { id: string; status: ApplicationStatus; coverNote: string; createdAt: string; studentName: string; studentEmail: string; opportunityTitle: string; organization: string; history: HistoryEntry[] }

const SETTABLE: ApplicationStatus[] = ["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED"];

export default function AdminApplicationsPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApi<{ applications: Row[] }>(`/admin/applications?pageSize=100${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [next, setNext] = useState<ApplicationStatus>("SHORTLISTED");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();

  const open = async (id: string) => {
    const res = await api.get<{ application: Detail }>(`/admin/applications/${id}`);
    setDetail(res.application);
    setNext(SETTABLE.find((s) => SETTABLE.indexOf(s) > SETTABLE.indexOf(res.application.status)) ?? "SELECTED");
    setNote("");
    setFormError(null);
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/admin/applications/${detail.id}/status`, { status: next, note });
      toast(`Status changed to ${STATUS_LABELS[next]}. ${detail.studentName} has been notified.`, "success");
      await open(detail.id);
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHead title="Applications" subtitle="Only administrators can move applications through the pipeline. Every change is logged and the student is notified." />
      <div className="toolbar">
        <div className="search-input"><Icon name="search" /><input className="input" placeholder="Search student or opportunity" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {[...SETTABLE, "WITHDRAWN" as const].map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data ? <PageLoading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Opportunity</th><th className="table-hide-sm">Applied</th><th className="table-hide-sm">Match</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data?.applications.length === 0 && <tr><td colSpan={6} className="faint">No applications found.</td></tr>}
              {data?.applications.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.studentName}</strong><div className="faint small">{a.studentEmail}</div></td>
                  <td>{a.opportunityTitle}<div className="faint small">{a.organization}</div></td>
                  <td className="table-hide-sm nowrap">{formatDate(a.createdAt)}</td>
                  <td className="table-hide-sm gold">{a.matchScoreAtApply}%</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td><div className="actions"><Button className="btn-secondary btn-xs" onClick={() => open(a.id)}>Review</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <Modal open size="lg" title={detail.studentName} subtitle={`${detail.opportunityTitle} · ${detail.organization}`} onClose={() => setDetail(null)}
          footer={detail.status !== "WITHDRAWN" ? <><Button className="btn-secondary" onClick={() => setDetail(null)}>Close</Button><Button loading={saving} disabled={next === detail.status} onClick={save}>Update status</Button></> : undefined}>
          <div className="stack-lg">
            <div className="kv">
              <div><span className="k">Current status</span><span className="v"><StatusBadge status={detail.status} /></span></div>
              <div><span className="k">Email</span><span className="v">{detail.studentEmail}</span></div>
              <div><span className="k">Applied</span><span className="v">{formatDate(detail.createdAt)}</span></div>
            </div>
            {detail.coverNote && <div><div className="card-title-gold" style={{ marginBottom: 8 }}>Cover note</div><p className="muted">{detail.coverNote}</p></div>}
            {detail.status === "WITHDRAWN" ? <div className="alert alert-warning">The student withdrew this application, so its status can no longer change.</div> : (
              <div className="form-grid">
                <Field label="New status">
                  <select className="select" value={next} onChange={(e) => setNext(e.target.value as ApplicationStatus)}>{SETTABLE.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
                </Field>
                <Field label="Note to student (optional)" hint="e.g. interview date and time">
                  <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
            )}
            <ErrorAlert message={formError} />
            <div>
              <div className="card-title-gold" style={{ marginBottom: 12 }}>Status history</div>
              <div className="timeline">
                {detail.history.map((h) => (
                  <div key={h.id} className={`timeline-item status-${h.toStatus}`}>
                    <strong>{STATUS_LABELS[h.toStatus]}</strong> <span className="faint small">· {formatDateTime(h.createdAt)} · by {h.changedBy ?? "system"}</span>
                    {h.note && <div className="muted small">{h.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
