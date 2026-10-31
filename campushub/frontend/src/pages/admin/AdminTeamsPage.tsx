import { useState } from "react";
import { ConfirmModal, PageHead, PageLoading, ProgressBar } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useToast } from "../../context/ToastContext";
import { useApi } from "../../hooks/useApi";
import { api, errorMessage } from "../../services/api";
import { formatDate } from "../../utils/format";

interface Row { id: string; name: string; projectTitle: string; maxSize: number; createdAt: string; ownerName: string; memberCount: number; coverage: number; readiness: number; members: string[] }

export default function AdminTeamsPage() {
  const { data, loading, error, reload } = useApi<{ teams: Row[] }>("/admin/teams");
  const [deleting, setDeleting] = useState<Row | null>(null);
  const toast = useToast();
  if (loading && !data) return <PageLoading />;
  return (
    <div>
      <PageHead title="Teams" subtitle="All Group Up teams with their skill coverage and readiness." />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Team</th><th className="table-hide-sm">Members</th><th>Coverage</th><th>Readiness</th><th className="table-hide-sm">Created</th><th /></tr></thead>
          <tbody>
            {data?.teams.length === 0 && <tr><td colSpan={6} className="faint">No teams yet.</td></tr>}
            {data?.teams.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong><div className="faint small">{t.projectTitle} · owner {t.ownerName}</div></td>
                <td className="table-hide-sm small">{t.memberCount}/{t.maxSize}<div className="faint">{t.members.join(", ")}</div></td>
                <td style={{ minWidth: 110 }}><span className="gold small">{t.coverage}%</span><ProgressBar value={t.coverage} /></td>
                <td style={{ minWidth: 110 }}><span className="mint small">{t.readiness}%</span><ProgressBar value={t.readiness} tone="mint" /></td>
                <td className="table-hide-sm nowrap">{formatDate(t.createdAt)}</td>
                <td><div className="actions"><button type="button" className="icon-btn sm" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}><Icon name="trash" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal open={Boolean(deleting)} title="Remove team?" message={`Remove ${deleting?.name}? All members will be notified.`} confirmLabel="Remove" danger onClose={() => setDeleting(null)}
        onConfirm={async () => { await api.del(`/admin/teams/${deleting!.id}`).catch((e) => toast(errorMessage(e), "error")); toast("Team removed.", "info"); setDeleting(null); await reload(); }} />
    </div>
  );
}
