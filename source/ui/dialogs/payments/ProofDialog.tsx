import { centavos } from "../../../shared/domain";
import { api, uploadProof } from "../../api/client";
import { Field } from "../../components/Field";
import { SubscriberPicker } from "../../components/SubscriberPicker";
import { useApp } from "../../app/AppContext";

export function ProofDialog() {
  const { busy, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) => {
          const form = e.currentTarget;
          submit(e, async (b) => {
            const r = await api("/proofs", {
              subscriberId: Number(b.subscriberId),
              reference: b.reference,
              sender: b.sender,
              amount: centavos(b.amount),
            });
            const file = (
              form.elements.namedItem("proofFile") as HTMLInputElement
            ).files?.[0];
            if (file) await uploadProof(r.id, file);
            await done(
              "GCash proof recorded. Verification is required before posting.",
            );
          });
        }}
      >
        <SubscriberPicker />
        <Field label="GCash reference *">
          <input name="reference" minLength={6} required />
        </Field>
        <Field label="Sender name *">
          <input name="sender" required />
        </Field>
        <Field label="Amount (PHP) *">
          <input name="amount" inputMode="decimal" required />
        </Field>
        <Field label="Proof image (PNG / JPEG, up to 5 MB) *">
          <input
            type="file"
            name="proofFile"
            accept="image/png,image/jpeg"
            required
          />
        </Field>
        <button className="primary" disabled={busy}>
          Submit for verification
        </button>
      </form>
    </>
  );
}
