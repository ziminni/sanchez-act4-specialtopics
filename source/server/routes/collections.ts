import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { manilaDate, manilaDateWindow } from "../../shared/domain.js";
import { id, reason, text } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

const batchSelect = `SELECT b.*,c.name AS collector,a.name AS area,r.remitted_cash,r.difference,COALESCE((SELECT sum(amount) FROM payments p WHERE p.batch_id=b.id AND method='Cash' AND NOT reversed),0) AS cash,COALESCE((SELECT sum(amount) FROM payments p WHERE p.batch_id=b.id AND method<>'Cash' AND NOT reversed),0) AS noncash FROM collection_batches b JOIN collectors c ON c.id=b.collector_id LEFT JOIN collection_areas a ON a.id=b.area_id LEFT JOIN collector_remittances r ON r.batch_id=b.id`;

const collectorPerformance = `WITH bt AS (SELECT * FROM collection_batches WHERE created_at>=$1 AND created_at<$2),
  agg AS (SELECT collector_id,count(*) AS batches,count(*) FILTER (WHERE status='CLOSED') AS closed,sum(expected) AS expected FROM bt GROUP BY collector_id),
  paid AS (SELECT b.collector_id,sum(p.amount) AS collected,sum(p.amount) FILTER (WHERE p.method='Cash') AS cash,count(DISTINCT p.subscriber_id) AS accounts FROM payments p JOIN bt b ON b.id=p.batch_id WHERE NOT p.reversed GROUP BY b.collector_id),
  rem AS (SELECT b.collector_id,sum(r.remitted_cash) AS remitted,sum(r.difference) AS difference,count(*) FILTER (WHERE r.difference<0) AS shortages FROM collector_remittances r JOIN bt b ON b.id=r.batch_id GROUP BY b.collector_id)
  SELECT c.id,c.name,c.active,(SELECT count(*) FROM subscribers s WHERE s.collector_id=c.id AND s.status='ACTIVE') AS assigned,
    COALESCE(agg.batches,0) AS batches,COALESCE(agg.closed,0) AS closed,COALESCE(agg.expected,0) AS expected,
    COALESCE(paid.collected,0) AS collected,COALESCE(paid.cash,0) AS cash,COALESCE(paid.accounts,0) AS accounts,
    COALESCE(rem.remitted,0) AS remitted,COALESCE(rem.difference,0) AS difference,COALESCE(rem.shortages,0) AS shortages
  FROM collectors c LEFT JOIN agg ON agg.collector_id=c.id LEFT JOIN paid ON paid.collector_id=c.id LEFT JOIN rem ON rem.collector_id=c.id
  ORDER BY COALESCE(paid.collected,0) DESC,c.name`;

export function registerCollectionRoutes({ get, post }: RouteContext) {
  get(
    "/batches",
    "collection.view",
    async () =>
      (await pool.query(`${batchSelect} ORDER BY b.id DESC LIMIT 100`)).rows,
  );
  post("/areas", "collection.manage", async (req: any) => {
    const b = z.object({ name: text }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO collection_areas(name) VALUES($1) RETURNING *",
          [b.name],
        )
      ).rows[0];
      await audit(db, req.actor.id, "area.create", "collection_areas", r.id, b);
      return r;
    });
  });
  post("/collectors", "collection.manage", async (req: any) => {
    const b = z.object({ name: text }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query("INSERT INTO collectors(name) VALUES($1) RETURNING *", [
          b.name,
        ])
      ).rows[0];
      await audit(db, req.actor.id, "collector.create", "collectors", r.id, b);
      return r;
    });
  });
  post("/batches", "collection.manage", async (req: any) => {
    const b = z.object({ collectorId: id, areaId: id }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO collection_batches(collector_id,area_id) VALUES($1,$2) RETURNING *",
          [b.collectorId, b.areaId],
        )
      ).rows[0];
      await db.query(
        `INSERT INTO batch_accounts(batch_id,subscriber_id,expected) SELECT $1,s.id,COALESCE(sum(i.balance),0) FROM subscribers s LEFT JOIN invoice_balances i ON i.subscriber_id=s.id AND i.status NOT IN ('VOID','DRAFT') WHERE s.collector_id=$2 AND s.area_id=$3 GROUP BY s.id`,
        [r.id, b.collectorId, b.areaId],
      );
      await db.query(
        "UPDATE collection_batches SET expected=(SELECT COALESCE(sum(expected),0) FROM batch_accounts WHERE batch_id=$1) WHERE id=$1",
        [r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch.create",
        "collection_batches",
        r.id,
        b,
      );
      return r;
    });
  });
  get(
    "/batches/:id/route",
    "collection.view",
    async (req: any) =>
      (
        await pool.query(
          "SELECT s.account_no,s.name,s.address,b.expected FROM batch_accounts b JOIN subscribers s ON s.id=b.subscriber_id WHERE b.batch_id=$1 ORDER BY s.address,s.name",
          [id.parse(req.params.id)],
        )
      ).rows,
  );
  post("/batches/:id/transition", "collection.reconcile", async (req: any) => {
    const b = z
      .object({ status: z.enum(["SUBMITTED", "RECONCILED", "CLOSED"]), reason })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM collection_batches WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!r) throw new Error("Batch not found");
      const allowed: Record<string, string[]> = {
        SUBMITTED: ["OPEN", "IN_PROGRESS"],
        RECONCILED: ["REMITTED"],
        CLOSED: ["RECONCILED"],
      };
      if (!allowed[b.status].includes(r.status))
        throw new Error(`Cannot change ${r.status} to ${b.status}`);
      await db.query(
        "UPDATE collection_batches SET status=$1,closed_by=CASE WHEN $1='CLOSED' THEN $2 ELSE closed_by END WHERE id=$3",
        [b.status, req.actor.id, r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch." + b.status.toLowerCase(),
        "collection_batches",
        r.id,
        b,
        b.reason,
      );
      return { ok: true };
    });
  });
  post("/batches/:id/remit", "collection.reconcile", async (req: any) => {
    const b = z
      .object({
        amount: z.number().int().nonnegative().max(999999999999),
        reason,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM collection_batches WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!r || r.status !== "SUBMITTED")
        throw new Error("Submit the collection batch before remittance");
      const cash = Number(
        (
          await db.query(
            "SELECT COALESCE(sum(amount),0) AS total FROM payments WHERE batch_id=$1 AND method='Cash' AND NOT reversed",
            [r.id],
          )
        ).rows[0].total,
      );
      await db.query(
        "INSERT INTO collector_remittances(batch_id,expected_cash,remitted_cash,difference,notes,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
        [r.id, cash, b.amount, b.amount - cash, b.reason, req.actor.id],
      );
      await db.query(
        "UPDATE collection_batches SET status='REMITTED' WHERE id=$1",
        [r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch.remit",
        "collection_batches",
        r.id,
        { cash, remitted: b.amount, difference: b.amount - cash },
        b.reason,
      );
      return { cash, remitted: b.amount, difference: b.amount - cash };
    });
  });
  get("/collections/overview", "collection.view", async () => {
    const today = manilaDate(new Date());
    const dayStart = new Date(manilaDateWindow(today, today).start);
    const monthStart = new Date(
      manilaDateWindow(today.slice(0, 8) + "01", today).start,
    );
    const tomorrow = new Date(manilaDateWindow(today, today).end);
    const [batches, collected, variance, counts, attention, collectors] =
      await Promise.all([
        pool.query(
          `SELECT count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS')) AS open_batches,
            count(*) FILTER (WHERE status='SUBMITTED') AS awaiting_remittance,
            count(*) FILTER (WHERE status='REMITTED') AS awaiting_reconciliation,
            count(*) FILTER (WHERE status='RECONCILED') AS awaiting_close,
            COALESCE(sum(expected) FILTER (WHERE status IN ('OPEN','IN_PROGRESS')),0) AS open_expected
          FROM collection_batches`,
        ),
        pool.query(
          "SELECT COALESCE(sum(amount) FILTER (WHERE paid_at>=$1),0) AS today,COALESCE(sum(amount),0) AS month FROM payments WHERE batch_id IS NOT NULL AND NOT reversed AND paid_at>=$2",
          [dayStart, monthStart],
        ),
        pool.query(
          "SELECT COALESCE(sum(difference),0) AS net,count(*) FILTER (WHERE difference<0) AS shortages,COALESCE(sum(difference) FILTER (WHERE difference<0),0) AS shortage_total FROM collector_remittances WHERE created_at>=$1",
          [monthStart],
        ),
        pool.query(
          "SELECT (SELECT count(*) FROM collection_areas) AS areas,(SELECT count(*) FROM collectors WHERE active) AS collectors",
        ),
        pool.query(
          `${batchSelect} WHERE b.status IN ('SUBMITTED','REMITTED','RECONCILED') ORDER BY b.created_at LIMIT 8`,
        ),
        pool.query(collectorPerformance, [monthStart, tomorrow]),
      ]);
    return {
      ...batches.rows[0],
      collected: collected.rows[0],
      variance: variance.rows[0],
      ...counts.rows[0],
      attention: attention.rows,
      topCollectors: collectors.rows.slice(0, 5),
      month: today.slice(0, 7),
    };
  });
  get("/collections/areas", "collection.view", async () => ({
    areas: (
      await pool.query(
        `SELECT a.id,a.name,
          (SELECT count(*) FROM subscribers s WHERE s.area_id=a.id AND s.status='ACTIVE') AS active_subscribers,
          (SELECT string_agg(DISTINCT c.name,', ') FROM subscribers s JOIN collectors c ON c.id=s.collector_id WHERE s.area_id=a.id) AS collectors,
          (SELECT COALESCE(sum(i.balance),0) FROM invoice_balances i JOIN subscribers s ON s.id=i.subscriber_id WHERE s.area_id=a.id AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT')) AS outstanding,
          (SELECT count(*) FROM collection_batches b WHERE b.area_id=a.id AND b.status<>'CLOSED') AS active_batches,
          (SELECT max(b.created_at) FROM collection_batches b WHERE b.area_id=a.id) AS last_batch
        FROM collection_areas a ORDER BY a.name`,
      )
    ).rows,
    collectors: (
      await pool.query(
        `SELECT c.id,c.name,c.active,
          (SELECT count(*) FROM subscribers s WHERE s.collector_id=c.id AND s.status='ACTIVE') AS assigned,
          (SELECT string_agg(DISTINCT a.name,', ') FROM subscribers s JOIN collection_areas a ON a.id=s.area_id WHERE s.collector_id=c.id) AS areas
        FROM collectors c ORDER BY c.name`,
      )
    ).rows,
  }));
  get("/collections/remittances", "collection.view", async () => ({
    queue: (
      await pool.query(
        `${batchSelect} WHERE b.status IN ('OPEN','IN_PROGRESS','SUBMITTED','REMITTED','RECONCILED') ORDER BY CASE b.status WHEN 'SUBMITTED' THEN 0 WHEN 'REMITTED' THEN 1 WHEN 'RECONCILED' THEN 2 ELSE 3 END,b.created_at`,
      )
    ).rows,
    history: (
      await pool.query(
        "SELECT r.id,r.batch_id,r.expected_cash,r.remitted_cash,r.difference,r.notes,r.created_at,b.status,c.name AS collector,a.name AS area,u.name AS actor FROM collector_remittances r JOIN collection_batches b ON b.id=r.batch_id JOIN collectors c ON c.id=b.collector_id LEFT JOIN collection_areas a ON a.id=b.area_id LEFT JOIN users u ON u.id=r.actor_id ORDER BY r.created_at DESC LIMIT 100",
      )
    ).rows,
  }));
  get("/collections/performance", "collection.view", async (req: any) => {
    const today = manilaDate(new Date());
    const q = z
      .object({
        from: z.iso.date().default(today.slice(0, 8) + "01"),
        to: z.iso.date().default(today),
      })
      .parse(req.query);
    if (q.from > q.to) throw new Error("Start date must not be after end date");
    const window = manilaDateWindow(q.from, q.to);
    return {
      ...q,
      rows: (
        await pool.query(collectorPerformance, [
          new Date(window.start),
          new Date(window.end),
        ])
      ).rows,
    };
  });
}
