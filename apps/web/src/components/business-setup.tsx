import { useState } from "react";
import { send, useAction, useData } from "../lib";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  Panel,
  Select,
  Status,
} from "./ui";

async function encoded(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
export function BusinessPhotos({ company }: { company: any }) {
  const { run, busy } = useAction();
  return (
    <Panel
      title="Business photography"
      description="Add photographs of your own premises, team, or laundry service."
    >
      <div className="business-photo-grid">
        {(["photo", "coverPhoto"] as const).map((kind) => (
          <div key={kind}>
            {company[kind] && (
              <img
                className="business-upload-preview"
                src={company[kind]}
                alt={kind === "photo" ? "Business profile" : "Business cover"}
              />
            )}
            <Field
              label={
                kind === "photo" ? "Profile photograph" : "Cover photograph"
              }
              hint="JPEG, PNG, or WebP · up to 3 MB · minimum 600 × 400 pixels"
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 3 * 1024 * 1024)
                        throw new Error("Choose a photograph up to 3 MB.");
                      await send("business/photo", {
                        base64: await encoded(file),
                        name: file.name,
                        kind,
                      });
                    }, "Business photograph saved.");
                  e.target.value = "";
                }}
              />
            </Field>
          </div>
        ))}
      </div>
    </Panel>
  );
}
export function SettlementAccount({ company }: { company: any }) {
  const { run, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const banks = useData(
    "settlement-banks",
    "business/settlement-banks",
    editing,
  );
  let destination: any = null;
  try {
    destination = JSON.parse(company.settlementDestination || "null");
  } catch {
    /* Older destination labels remain display-only. */
  }
  return (
    <Panel
      title="Your settlement account"
      action={
        <Status
          value={
            company.paymentAccountApproved
              ? "approved"
              : destination
                ? "pending"
                : "incomplete"
          }
        />
      }
    >
      {destination && (
        <p>
          <strong>{destination.accountName}</strong>
          <br />
          {destination.bankName}
          {destination.accountLast4
            ? ` · ending ${destination.accountLast4}`
            : " · awaiting review"}
        </p>
      )}
      {company.paymentAccountApproved ? (
        <p>Contact support to request a change to this approved account.</p>
      ) : (
        <>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {destination
                ? "Update account details"
                : "Add settlement account"}
            </Button>
          )}
          {editing &&
            (banks.isPending ? (
              <Loading />
            ) : banks.isError ? (
              <ErrorState error={banks.error} />
            ) : (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void run(async () => {
                    await send("business/settlement-account", {
                      bankCode: form.get("bankCode"),
                      accountName: form.get("accountName"),
                      accountNumber: form.get("accountNumber"),
                    });
                    setEditing(false);
                  }, "Settlement account submitted for administrator review.");
                }}
              >
                <Field label="Ghanaian bank">
                  <Select
                    name="bankCode"
                    required
                    defaultValue={destination?.bankCode || ""}
                  >
                    <option value="">Choose a bank</option>
                    {banks.data?.map((bank: any) => (
                      <option value={bank.code} key={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Account holder name">
                  <input
                    name="accountName"
                    required
                    minLength={3}
                    maxLength={150}
                    autoComplete="off"
                    defaultValue={destination?.accountName || ""}
                  />
                </Field>
                <Field label="Account number">
                  <input
                    name="accountNumber"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6,20}"
                    autoComplete="off"
                    defaultValue={destination?.accountNumber || ""}
                  />
                </Field>
                <Button type="submit" busy={busy}>
                  Submit for review
                </Button>
              </form>
            ))}
        </>
      )}
    </Panel>
  );
}
