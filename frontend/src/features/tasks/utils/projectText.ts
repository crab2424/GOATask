import type { Project } from "../../../api/projects";
import type { Task } from "../../../api/tasks";

export interface ProjectTextImport {
  project?: { id?: number; name: string };
  tasks: Array<{
    id?: number;
    title: string;
    description: string;
    status: Task["status"];
    start_date: string | null;
    due_date: string | null;
    projectId?: number;
  }>;
  projects: Array<{ id?: number; name: string; parentId?: number }>;
}

function attr(line: string, key: string): string | undefined {
  return line.match(new RegExp(`${key}=([^\\s>]+)`))?.[1];
}

// 詳細欄の「# 」で始まる行は、読み込み時にプロジェクト／タスクの見出しと区別できない。
// 出力時に行頭へ "\\" を付け、読み込み時に外すことで本文として往復させる。
// 元から "\\#" で始まる行も区別できるよう、先頭のバックスラッシュ込みで判定する。
const HEADING_LINE = /^\\*#{1,6}\s/;
const ESCAPED_HEADING_LINE = /^\\+#{1,6}\s/;
function escapeDescription(description: string): string {
  return description
    .split("\n")
    .map((line) => (HEADING_LINE.test(line) ? `\\${line}` : line))
    .join("\n");
}

function metadata(kind: string, item: { id?: number; status?: string; start?: string | null; due?: string | null; parent?: number | null }) {
  const values = [`<!-- goatask:${kind}`];
  if (item.id) values.push(`id=${item.id}`);
  if (item.status) values.push(`status=${item.status}`);
  if (item.start) values.push(`start=${item.start.slice(0, 10)}`);
  if (item.due) values.push(`due=${item.due.slice(0, 10)}`);
  if (item.parent) values.push(`parent=${item.parent}`);
  return `${values.join(" ")} -->`;
}

export function projectToMarkdown(root: Project, projects: Project[], tasks: Task[]): string {
  const children = new Map<number | null, Project[]>();
  for (const project of projects) {
    const parent = project.parent_id ?? null;
    const list = children.get(parent) ?? [];
    list.push(project);
    children.set(parent, list);
  }
  const tasksByProject = new Map<number | null, Task[]>();
  for (const task of tasks) {
    const projectId = task.project_id ?? null;
    const list = tasksByProject.get(projectId) ?? [];
    list.push(task);
    tasksByProject.set(projectId, list);
  }
  const lines = ["# " + root.name, metadata("project", { id: root.id, parent: root.parent_id })];
  const writeProject = (project: Project, depth: number) => {
    lines.push("", `# ${project.name}`, metadata("project", { id: project.id, parent: project.parent_id }));
    for (const task of tasksByProject.get(project.id) ?? []) {
      const fields = { id: task.id, status: task.status, start: task.start_date, due: task.due_date };
      lines.push("", `## ${task.title}`, metadata("task", fields), escapeDescription(task.description ?? ""));
    }
    for (const child of children.get(project.id) ?? []) writeProject(child, depth + 1);
  };
  for (const task of tasksByProject.get(root.id) ?? []) {
    lines.push("", `## ${task.title}`, metadata("task", { id: task.id, status: task.status, start: task.start_date, due: task.due_date }), escapeDescription(task.description ?? ""));
  }
  for (const child of children.get(root.id) ?? []) writeProject(child, 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function parseProjectMarkdown(text: string): ProjectTextImport {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const result: ProjectTextImport = { tasks: [], projects: [] };
  let currentProjectId: number | undefined;
  let currentTask: ProjectTextImport["tasks"][number] | null = null;
  const finishTask = () => {
    if (currentTask) result.tasks.push({ ...currentTask, projectId: currentProjectId });
    currentTask = null;
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    // 出力時にエスケープした「\\# ...」は見出しではなく本文として戻す
    if (ESCAPED_HEADING_LINE.test(line)) {
      if (currentTask) currentTask.description += (currentTask.description ? "\n" : "") + line.slice(1);
      continue;
    }
    const projectMatch = line.match(/^#{1,6}\s+(.+)$/);
    const taskMatch = line.match(/^##\s+(.+)$/);
    if (projectMatch && !taskMatch) {
      finishTask();
      const name = projectMatch[1].trim();
      currentProjectId = undefined;
      result.projects.push({ name });
      const entry = result.projects[result.projects.length - 1];
      result.project = result.project ?? { name };
      const next = lines[lineIndex + 1] ?? "";
      const id = attr(next, "id");
      const parent = attr(next, "parent");
      // Negative temporary IDs keep newly written headings associated with
      // their following tasks until the importer creates the real project.
      const parsedId = id ? Number(id) : -result.projects.length;
      entry.id = parsedId;
      currentProjectId = parsedId;
      if (result.projects.length === 1) result.project.id = parsedId;
      if (parent) entry.parentId = Number(parent);
      continue;
    }
    if (taskMatch) {
      finishTask();
      const title = taskMatch[1].trim();
      currentTask = { title, description: "", status: "todo", start_date: null, due_date: null };
      continue;
    }
    if (line.includes("<!-- goatask:task")) {
      if (!currentTask) continue;
      const id = attr(line, "id"); const status = attr(line, "status");
      if (id) currentTask.id = Number(id);
      if (status === "todo" || status === "doing" || status === "done") currentTask.status = status;
      currentTask.start_date = attr(line, "start") ? `${attr(line, "start")}T00:00:00Z` : null;
      currentTask.due_date = attr(line, "due") ? `${attr(line, "due")}T00:00:00Z` : null;
      continue;
    }
    if (line.includes("<!-- goatask:project")) continue;
    if (currentTask) currentTask.description += (currentTask.description ? "\n" : "") + line;
  }
  finishTask();
  for (const task of result.tasks) task.description = task.description.trim();
  if (!result.project && result.projects[0]) result.project = { ...result.projects[0] };
  if (!result.project) throw new Error("プロジェクト見出しが見つかりません");
  return result;
}
