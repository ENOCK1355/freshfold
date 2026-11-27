import { useState } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import { useApp, useData, useAction, send, dateLabel } from "../lib";
import {
  PageHead,
  Panel,
  Button,
  Status,
  Loading,
  ErrorState,
  Empty,
  Field,
  Select,
  Modal,
  Pagination,
} from "./ui";
export function SupportWorkspace() {
  const { user } = useApp();
  const { run, busy } = useAction();
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    paged: "true",
    page: String(page),
    status: filter,
  });
  const data = useData(`tickets-${params}`, `tickets?${params}`, true, true);
  const staff = ["admin", "support"].includes(user?.role || "");
  const rows = data.data?.items || [];
  const ticket = rows.find((t: any) => t.id === selected);
  return (
    <>
      <PageHead
        eyebrow="A HUMAN HAND, WHEN YOU NEED IT"
        title={
          staff
            ? "Support, thoughtfully handled."
            : "A little help, right here."
        }
        description={
          staff
            ? "Review cases, messages, evidence, and resolutions. Refunds require separate administrator authorisation."
            : "Every question and case, kept together."
        }
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={17} /> Open a case
          </Button>
        }
      />
      <div className="filter-tabs">
        {["all", "open", "investigating", "resolved"].map((s) => (
          <button
            className={filter === s ? "active" : ""}
            onClick={() => {
              setFilter(s);
              setPage(1);
              setSelected(null);
            }}
            key={s}
          >
            {s === "all" ? "All cases" : s}
          </button>
        ))}
      </div>
      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} />
      ) : rows.length ? (
        <div className="support-layout">
          <Panel>
            <div className="support-case-list">
              {rows.map((t: any) => (
                <button
                  key={t.id}
                  className={selected === t.id ? "selected" : ""}
                  onClick={() => setSelected(t.id)}
                >
                  <div>
                    <strong>{t.subject}</strong>
                    <Status value={t.status} />
                  </div>
                  <span>
                    {t.reference} · {t.category}
                  </span>
                  <small>{dateLabel(t.createdAt)}</small>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={ticket?.subject || "Every detail matters."}>
            {ticket ? (
              <>
                <div className="panel-head">
                  <BadgeReference text={ticket.reference} />
                  <Status value={ticket.status} />
                </div>
                <p className="body-copy">{ticket.body}</p>
                {ticket.resolution && (
                  <div className="notice">
                    <CheckCircle2 />
                    <p>{ticket.resolution}</p>
                  </div>
                )}
                <div className="message-list">
                  {ticket.events.map((e: any) => (
                    <div className="message" key={e.id}>
                      <strong>
                        {e.actorId === user?.id
                          ? "You"
                          : staff
                            ? "Case participant"
                            : "Support team"}
                      </strong>
                      <p>{e.body}</p>
                      <small>
                        {dateLabel(e.createdAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  ))}
                </div>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    void run(async () => {
                      await send(`tickets/${ticket.id}/reply`, {
                        body: f.get("body"),
                        status: staff ? f.get("status") : undefined,
                      });
                      form.reset();
                    }, "Case update saved.");
                  }}
                >
                  <Field label="Add a case update">
                    <textarea
                      name="body"
                      required
                      minLength={3}
                      maxLength={4000}
                      rows={3}
                    />
                  </Field>
                  {staff && (
                    <Field label="Case status">
                      <Select name="status" defaultValue={ticket.status}>
                        <option value="open">Open</option>
                        <option value="investigating">Investigating</option>
                        <option value="resolved">Resolved</option>
                      </Select>
                    </Field>
                  )}
                  <Button type="submit" busy={busy}>
                    Save case update
                  </Button>
                </form>
              </>
            ) : (
              <Empty text="Choose a case to read its timeline and continue the conversation." />
            )}
          </Panel>
        </div>
      ) : (
        <Empty
          title="A clear slate."
          text="If something needs attention, open a case and we’ll keep the conversation here."
        />
      )}
      {data.data && (
        <Pagination
          {...data.data}
          onPage={(value) => {
            setPage(value);
            setSelected(null);
          }}
          busy={data.isFetching}
          label="cases"
        />
      )}
      {modal && (
        <Modal
          title="Let’s help you find a fresh start."
          onClose={() => setModal(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send("contact", {
                  name: user?.name,
                  subject: f.get("subject"),
                  body: f.get("body"),
                  category: f.get("category"),
                });
                setModal(false);
                setPage(1);
                setFilter("all");
              }, "Your case is saved.");
            }}
          >
            <Field label="What’s this about?">
              <Select name="category">
                <option value="general">General question</option>
                <option value="booking">A booking</option>
                <option value="payment">Payment or refund</option>
                <option value="garment-care">Garment care</option>
                <option value="privacy">My data & privacy</option>
                <option value="business">Business support</option>
              </Select>
            </Field>
            <Field label="Subject">
              <input name="subject" required minLength={5} maxLength={200} />
            </Field>
            <Field label="How can we help?">
              <textarea
                name="body"
                required
                minLength={10}
                maxLength={4000}
                rows={5}
              />
            </Field>
            <Button type="submit" busy={busy}>
              Open support case
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function BadgeReference({ text }: { text: string }) {
  return <span className="muted small">{text}</span>;
}
