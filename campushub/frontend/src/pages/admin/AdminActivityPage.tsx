import { useState } from "react";
import { Button, PageHead, PageLoading } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { formatDateTime } from "../../utils/format";
import { describeActivity } from "./AdminDashboardPage";

interface Row { id: number; action: string; entityType: string; details: Record<string, string>; isAdminAction: boolean; createdAt: string; actorName: string | null; actorEmail: string | null }

export default function AdminActivityPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<{ activity: Row[] }>(`/admin/activity?page=${page}&pageSize=30`);
  return (
    <div>
      <PageHead title="Activity log" subtitle="Registrations, applications, team changes and every administrator action." />
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data ? <PageLoading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Type</th></tr></thead>
            <tbody>
              {data?.activity.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap small">{formatDateTime(a.createdAt)}</td>
                  <td>{a.actorName ?? "System"}<div className="faint small">{a.actorEmail}</div></td>
                  <td>{describeActivity(a.action, a.details)}</td>
                  <td>{a.isAdminAction ? <span className="pill">Admin</span> : <span className="pill pill-muted">Student</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <Button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="faint small">Page {page}</span>
        <Button className="btn-secondary btn-sm" disabled={(data?.activity.length ?? 0) < 30} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
