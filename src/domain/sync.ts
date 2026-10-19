import { emptyLedger, type Ledger } from "./ledger";
import { entityNames, type EntityName } from "./finance";
import { canonical } from "./serialization";
export { canonical } from "./serialization";
export type RecordValue = { id: string; [key: string]: unknown };
export type Records = Record<string, RecordValue>;
export interface Mutation {
  entity: EntityName;
  id: string;
  before: RecordValue | null;
  after: RecordValue | null;
}
export interface Conflict extends Mutation {
  remote: RecordValue | null;
}
export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function toRecords(ledger: Ledger): Records {
  return Object.fromEntries(
    entityNames.flatMap((entity) =>
      ledger[entity].map((row) => [
        `${entity}/${row.id}`,
        row as unknown as RecordValue,
      ]),
    ),
  );
}
export function fromRecords(records: Records): Ledger {
  const ledger = emptyLedger();
  for (const entity of entityNames)
    (ledger[entity] as unknown[]) = Object.entries(records)
      .filter(([key]) => key.startsWith(entity + "/"))
      .map(([, row]) => row);
  return ledger;
}
export function mutations(base: Records, current: Records): Mutation[] {
  return [...new Set([...Object.keys(base), ...Object.keys(current)])]
    .filter((key) => !same(base[key] ?? null, current[key] ?? null))
    .map((key) => {
      const [entity, id] = key.split("/");
      return {
        entity: entity as EntityName,
        id,
        before: base[key] ?? null,
        after: current[key] ?? null,
      };
    });
}
export function mergeMutation(
  change: Mutation,
  remote: RecordValue | null,
): { value: RecordValue | null; conflict: boolean } {
  if (same(remote, change.after)) return { value: remote, conflict: false };
  if (same(remote, change.before))
    return { value: change.after, conflict: false };
  if (!remote || !change.before || !change.after)
    return { value: remote, conflict: true };
  const merged = { ...remote };
  for (const field of new Set([
    ...Object.keys(change.before),
    ...Object.keys(change.after),
  ])) {
    if (field === "updatedAt") continue;
    if (same(change.before[field], change.after[field])) continue;
    if (
      !same(remote[field], change.before[field]) &&
      !same(remote[field], change.after[field])
    )
      return { value: remote, conflict: true };
    if (field in change.after) merged[field] = change.after[field];
    else delete merged[field];
  }
  if ("updatedAt" in merged)
    merged.updatedAt = [
      String(remote.updatedAt),
      String(change.after.updatedAt),
    ]
      .sort()
      .at(-1)!;
  return { value: merged, conflict: false };
}
