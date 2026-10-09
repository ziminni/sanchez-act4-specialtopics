import { api } from "../../api/client";
import { PaymentForm } from "./PaymentForm";
import { useApp } from "../../app/AppContext";

export function PaymentDialog() {
  const { busy, setModal, setSelected, reload, submit } = useApp();
  return (
    <>
      <PaymentForm
        api={api}
        busy={busy}
        submit={submit}
        onDone={async (r) => {
          setSelected(r);
          await reload();
          setModal("receipt");
        }}
      />
    </>
  );
}
