const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export interface Project {
  id: number;
  name: string;
  parent_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface NewProject {
  name: string;
  parent_id?: number | null;
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error(`listProjects failed: ${res.status}`);
  return res.json();
}

export async function createProject(input: NewProject): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
  return res.json();
}

export async function updateProject(
  id: number,
  input: Partial<Project>,
): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`updateProject failed: ${res.status}`);
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`deleteProject failed: ${res.status}`);
}
