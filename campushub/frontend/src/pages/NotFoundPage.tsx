import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p className="muted">This page doesn't exist.</p>
      <Link className="btn btn-primary" to="/">Go to CampusHub</Link>
    </div>
  );
}
