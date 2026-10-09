import { pool } from "../db.js";
export async function securityEvent(
  req: any,
  action: string,
  outcome: "SUCCESS" | "FAILURE" | "DENIED",
  actor: number | null,
  details: Record<string, unknown> = {},
) {
  await pool.query(
    "INSERT INTO audit_logs(actor_id,action,entity,entity_id,new_value,reason,outcome,source_ip,request_id) VALUES($1,$2,'security',$3,$4,$5,$6,$7,$8)",
    [
      actor,
      action,
      String(actor ?? "anonymous"),
      JSON.stringify(details),
      details.reason ?? "",
      outcome,
      req.ip,
      req.id,
    ],
  );
}
