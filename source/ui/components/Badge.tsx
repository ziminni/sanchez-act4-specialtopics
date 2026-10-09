export function Badge({ value }: { value: any }) {
  return (
    <span
      className={"badge " + String(value).toLowerCase().replaceAll("_", "-")}
    >
      {String(value ?? "—").replaceAll("_", " ")}
    </span>
  );
}
