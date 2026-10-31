import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Button, PageHead, PageLoading, ProgressBar, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useApi } from "../../hooks/useApi";
import { api, errorMessage } from "../../services/api";
import type { ApplicationStatus, Completion } from "../../types";
import { formatDate, timeAgo } from "../../utils/format";

interface Row { id: string; fullName: string; email: string; isActive: boolean; onboardingCompleted: boolean; lastLoginAt: string | null; createdAt: string; college: string | null; course: string | null; semester: number | null }
interface Detail { student: Row; skills: { name: string; proficiency: number }[]; counts: Record<string, number>; completion: Completion; applications: { id: string; status: ApplicationStatus; title: string; createdAt: string }[] }

export default function AdminStudentsPage() {
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApi<{ students: Row[]; total: number }>(`/admin/students?pageSize=100&q=${encodeURIComponent(q)}`);
  const [detail, setDetail] = useState<Detail | null>(null);
  const toast = useToast();

  const toggle = async (s: Row) => {
    try {
      await api.patch(`/admin/students/${s.id}`, { isActive: !s.isActive });
      toast(s.isActive ? `${s.fullName} deactivated and logged out.` : `${s.fullName} reactivated.`, "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div>
      <PageHead title="Students" subtitle={`${data?.total ?? 0} registered students`} />
      <div className="search-input" style={{ maxWidth: 420, marginBottom: 20 }}><Icon name="search" /><input className="input" placeholder="Search name, email or college" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data ? <PageLoading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th className="table-hide-sm">College / course</th><th className="table-hide-sm">Joined</th><th className="table-hide-sm">Last login</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data?.students.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.fullName}</strong><div className="faint small">{s.email}</div></td>
                  <td className="table-hide-sm small">{s.college}<div className="faint">{s.course}{s.semester ? ` · Sem ${s.semester}` : ""}</div></td>
                  <td className="table-hide-sm nowrap">{formatDate(s.createdAt)}</td>
                  <td className="table-hide-sm nowrap">{s.lastLoginAt ? timeAgo(s.lastLoginAt) : "Never"}</td>
                  <td>
                    <span className={`pill ${s.isActive ? "pill-mint" : "pill-red"}`}>{s.isActive ? "Active" : "Deactivated"}</span>
                    {!s.onboardingCompleted && <span className="pill pill-amber" style={{ marginLeft: 6 }}>Onboarding</span>}
                  </td>
                  <td>
                    <div className="actions">
                      <Button className="btn-secondary btn-xs" onClick={async () => setDetail(await api.get<Detail>(`/admin/students/${s.id}`))}>View</Button>
                      <Button className={s.isActive ? "btn-danger btn-xs" : "btn-success btn-xs"} onClick={() => toggle(s)}>{s.isActive ? "Deactivate" : "Activate"}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <Modal open size="lg" title={detail.student.fullName} subtitle={detail.student.email} onClose={() => setDetail(null)}>
          <div className="stack-lg">
            <div className="kv">
              {Object.entries(detail.counts).map(([k, v]) => <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
            </div>
            <div><div className="row-between small"><span>Profile completion</span><span className="gold">{detail.completion.percentage}%</span></div><ProgressBar value={detail.completion.percentage} /></div>
            <div><div className="card-title-gold" style={{ marginBottom: 8 }}>Skills</div><div className="chip-list">{detail.skills.map((s) => <span key={s.name} className="chip">{s.name} · {s.proficiency}%</span>)}</div></div>
            <div>
              <div className="card-title-gold" style={{ marginBottom: 8 }}>Applications</div>
              {detail.applications.length === 0 ? <p className="faint small">None</p> : <div className="list">{detail.applications.map((a) => <div key={a.id} className="list-item"><div className="grow">{a.title}<div className="sub">{formatDate(a.createdAt)}</div></div><StatusBadge status={a.status} /></div>)}</div>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
