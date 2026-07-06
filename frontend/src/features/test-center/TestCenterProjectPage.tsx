import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

export function TestCenterProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) navigate(`/projects/${id}`, { replace: true });
  }, [id, navigate]);

  return null;
}
