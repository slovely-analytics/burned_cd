import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { workspaceState } from "../../../db/schema";

const workspaceId = "default";

type WorkspacePayload = {
  entries: unknown[];
  selectedPlan: string;
  notes: string;
  setup: Record<string, string>;
  activity: string[];
};

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table") || combined.includes("workspace_state")) {
    return "The shared workspace table is unavailable. Deploy the generated D1 migration before saving shared changes.";
  }

  return message;
}

function isWorkspacePayload(value: unknown): value is WorkspacePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<WorkspacePayload>;
  return Array.isArray(payload.entries)
    && typeof payload.selectedPlan === "string"
    && typeof payload.notes === "string"
    && !!payload.setup
    && typeof payload.setup === "object"
    && Array.isArray(payload.activity)
    && payload.activity.every((item) => typeof item === "string");
}

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db.select().from(workspaceState).where(eq(workspaceState.id, workspaceId)).limit(1);

    if (!row) {
      return Response.json({ workspace: null, updatedAt: null });
    }

    return Response.json({ workspace: JSON.parse(row.stateJson) as WorkspacePayload, updatedAt: row.updatedAt });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { workspace?: unknown };
    if (!isWorkspacePayload(body.workspace)) {
      return Response.json({ error: "A complete workspace payload is required." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const db = getDb();
    await db.insert(workspaceState).values({
      id: workspaceId,
      stateJson: JSON.stringify(body.workspace),
      updatedAt,
    }).onConflictDoUpdate({
      target: workspaceState.id,
      set: { stateJson: JSON.stringify(body.workspace), updatedAt },
    });

    return Response.json({ workspace: body.workspace, updatedAt });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
