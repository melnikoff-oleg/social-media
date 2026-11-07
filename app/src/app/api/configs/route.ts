import {
  authorize,
  auditIfAdmin,
  duplicate,
  invalidBody,
  invalidId,
  notFound,
  parseId,
  readJson,
  withErrors,
} from "@/lib/api/route-helpers";
import {
  configInputSchema,
  configPatchSchema,
  createConfig,
  deleteConfig,
  listConfigs,
  updateConfig,
} from "@/lib/repo/configs";
import { toConfig } from "@/lib/api/serializers";

export const GET = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const rows = await listConfigs(scope.userId);
  return Response.json(rows.map(toConfig));
});

export const POST = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const parsed = configInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidBody();
  const result = await createConfig(scope.userId, parsed.data);
  if ("error" in result) return duplicate();
  await auditIfAdmin(scope, "create", { resource: "config", id: result.id });
  return Response.json(toConfig(result), { status: 201 });
});

export const PUT = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const body = await readJson(request);
  if (typeof body !== "object" || body === null) return invalidBody();
  const id = parseId((body as { id?: unknown }).id);
  if (!id) return invalidId();
  const parsed = configPatchSchema.safeParse(body);
  if (!parsed.success) return invalidBody();
  const result = await updateConfig(scope.userId, id, parsed.data);
  if (result === undefined) return notFound();
  if ("error" in result) return duplicate();
  await auditIfAdmin(scope, "update", { resource: "config", id });
  return Response.json(toConfig(result));
});

export const DELETE = withErrors(async (request) => {
  const scope = await authorize(request);
  if ("response" in scope) return scope.response;
  const id = parseId(new URL(request.url).searchParams.get("id"));
  if (!id) return invalidId();
  if (!(await deleteConfig(scope.userId, id))) return notFound();
  await auditIfAdmin(scope, "delete", { resource: "config", id });
  return Response.json({ success: true });
});
