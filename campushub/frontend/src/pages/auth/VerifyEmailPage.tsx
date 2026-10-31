import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Spinner } from "../../components/ui";
import { AuthLayout } from "../../layouts/AuthLayout";
import { api, errorMessage } from "../../services/api";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<{ ok?: boolean; message?: string }>({});
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token");
    if (!token) {
      setState({ ok: false, message: "This verification link is missing its token." });
      return;
    }
    api
      .post<{ message: string }>("/auth/verify-email", { token })
      .then((r) => setState({ ok: true, message: r.message }))
      .catch((e) => setState({ ok: false, message: errorMessage(e) }));
  }, [params]);

  return (
    <AuthLayout>
      <h2>Email verification</h2>
      <div className="stack" style={{ marginTop: 20 }}>
        {state.message === undefined ? <Spinner /> : <div className={`alert ${state.ok ? "alert-success" : "alert-error"}`}>{state.message}</div>}
        <Link className="btn btn-primary" to="/login">Go to login</Link>
      </div>
    </AuthLayout>
  );
}
