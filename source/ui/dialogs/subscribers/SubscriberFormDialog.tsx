import { api } from "../../api/client";
import type { Row } from "../../lib/types";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function SubscriberFormDialog() {
  const {
    busy,
    lookups,
    modal,
    suggestedAccountNo,
    identifierToken,
    profile,
    submit,
    done,
  } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            const subscriber = await api(
              modal === "subscriber-edit"
                ? `/subscribers/${profile!.subscriber.id}/edit`
                : "/subscribers",
              {
                ...b,
                ...(modal === "subscriber" ? { identifierToken } : {}),
                areaId: Number(b.areaId),
                collectorId: Number(b.collectorId),
                billingDay: Number(b.billingDay),
                dueDay: Number(b.dueDay),
              },
            );
            await done(
              modal === "subscriber-edit"
                ? `Subscriber ${subscriber.account_no} updated.`
                : `Subscriber ${subscriber.account_no} registered. Open the profile to add services.`,
            );
          })
        }
      >
        <div className="form-grid">
          <Field label="Account number *">
            <input
              name="accountNo"
              disabled
              className="generated-id"
              defaultValue={
                modal === "subscriber-edit"
                  ? profile?.subscriber.account_no
                  : suggestedAccountNo
              }
            />
          </Field>
          <Field label="Full name *">
            <input
              name="name"
              required
              defaultValue={
                modal === "subscriber-edit" ? profile?.subscriber.name : ""
              }
            />
          </Field>
          <Field label="Contact number">
            <input
              name="contact"
              defaultValue={
                modal === "subscriber-edit" ? profile?.subscriber.contact : ""
              }
            />
          </Field>
          <Field label="Address *">
            <input
              name="address"
              required
              defaultValue={
                modal === "subscriber-edit" ? profile?.subscriber.address : ""
              }
            />
          </Field>
          <Field label="Collection area *">
            <select
              name="areaId"
              required
              defaultValue={
                modal === "subscriber-edit"
                  ? profile?.subscriber.area_id
                  : undefined
              }
            >
              {lookups.areas.map((r: Row) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assigned collector *">
            <select
              name="collectorId"
              required
              defaultValue={
                modal === "subscriber-edit"
                  ? profile?.subscriber.collector_id
                  : undefined
              }
            >
              {lookups.collectors.map((r: Row) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing day *">
            <input
              name="billingDay"
              type="number"
              min="1"
              max="28"
              defaultValue={
                modal === "subscriber-edit"
                  ? profile?.subscriber.billing_day
                  : 1
              }
              required
            />
          </Field>
          <Field label="Due day *">
            <input
              name="dueDay"
              type="number"
              min="1"
              max="28"
              defaultValue={
                modal === "subscriber-edit" ? profile?.subscriber.due_day : 15
              }
              required
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={
              modal === "subscriber-edit" ? profile?.subscriber.notes : ""
            }
          />
        </Field>
        <button className="primary" disabled={busy}>
          Save subscriber
        </button>
      </form>
    </>
  );
}
