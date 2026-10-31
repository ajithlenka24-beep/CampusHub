import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../services/api";

/** Loads data from a GET endpoint and exposes loading/error state plus reload(). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const call = ++latest.current;
    setLoading(true);
    try {
      const result = await api.get<T>(path);
      if (call === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (call === latest.current) setError(errorMessage(err));
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}
