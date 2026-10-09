import { Check } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { money } from "../../shared/domain";
import { api } from "../api/client";
import type { Row } from "../lib/types";
import { Field } from "./Field";

export function SubscriberPicker({
  onSelect,
}: {
  onSelect?: (r: Row | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [chosen, setChosen] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!open || chosen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api("/subscribers?search=" + encodeURIComponent(query.trim()))
        .then((result) => {
          if (cancelled) return;
          setOptions(result.rows.slice(0, 8));
          setTotal(result.total);
          setActive(-1);
        })
        .catch((e) => {
          if (!cancelled) {
            setOptions([]);
            setError(e.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, chosen]);
  const select = (subscriber: Row) => {
    setChosen(subscriber);
    setQuery(`${subscriber.name} · ${subscriber.account_no}`);
    setOpen(false);
    setOptions([]);
    setActive(-1);
    onSelect?.(subscriber);
  };
  const edit = (value: string) => {
    setQuery(value);
    setChosen(null);
    setOptions([]);
    setActive(-1);
    setError("");
    setLoading(true);
    setOpen(true);
    onSelect?.(null);
  };
  return (
    <div
      className="subscriber-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <Field label="Subscriber *">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !chosen}
          aria-controls={listId}
          aria-activedescendant={
            open && active >= 0 ? `${listId}-${options[active]?.id}` : undefined
          }
          autoComplete="off"
          placeholder="Search subscriber name or account…"
          value={query}
          maxLength={100}
          onFocus={() => {
            if (!chosen) setOpen(true);
          }}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (chosen) return;
              setOpen(true);
              setActive((n) =>
                e.key === "ArrowDown"
                  ? Math.min(n + 1, options.length - 1)
                  : Math.max(n - 1, 0),
              );
            }
            if (e.key === "Enter" && open && !chosen) {
              e.preventDefault();
              const match = options[active >= 0 ? active : 0];
              if (match && !loading) select(match);
            }
          }}
          required
        />
      </Field>
      <input type="hidden" name="subscriberId" value={chosen?.id || ""} />
      {open && !chosen && (
        <div className="picker-dropdown">
          <div className="picker-caption">
            {query.trim()
              ? "Matching subscribers"
              : "Choose a subscriber or type to search"}
          </div>
          {loading ? (
            <div className="picker-message" role="status">
              Searching subscribers…
            </div>
          ) : error ? (
            <div className="picker-message red-text" role="alert">
              {error}
            </div>
          ) : (
            <>
              <div
                className="picker-results"
                role="listbox"
                id={listId}
                aria-label="Matching subscribers"
              >
                {options.map((subscriber, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    id={`${listId}-${subscriber.id}`}
                    key={subscriber.id}
                    className={active === index ? "highlighted" : ""}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => select(subscriber)}
                  >
                    <span className="picker-person">
                      <strong>{subscriber.name}</strong>
                      <small>{subscriber.account_no}</small>
                      <small className="picker-address">
                        {subscriber.address}
                      </small>
                    </span>
                    <span className="picker-balance">
                      <strong>{money(subscriber.outstanding)}</strong>
                      <small>Outstanding</small>
                    </span>
                  </button>
                ))}
              </div>
              {!options.length && (
                <div className="picker-message" role="status">
                  No subscribers found. Try another name or account number.
                </div>
              )}
              {total > options.length && (
                <div className="picker-caption">
                  Showing {options.length} of {total} matches. Keep typing to
                  narrow the list.
                </div>
              )}
            </>
          )}
        </div>
      )}
      {chosen ? (
        <div className="picker-selection">
          <span>
            <Check size={14} /> Selected: <strong>{chosen.name}</strong>
          </span>
          <button type="button" onClick={() => edit("")}>
            Change subscriber
          </button>
        </div>
      ) : (
        <p className="picker-help">
          Type any part of a name or account number, then choose a match.
        </p>
      )}
    </div>
  );
}
