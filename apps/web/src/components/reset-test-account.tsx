import { RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { send, useApp } from "../lib";
import { Button, Field, Modal, Panel } from "./ui";

export function ResetTestAccount() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user?.canResetTestAccount) return null;
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true);
    setError("");
    try {
      await send("account/reset-test", { password });
      sessionStorage.removeItem("ff_compare");
      window.location.replace(
        user.role === "owner" ? "/register?type=company" : "/register",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      setBusy(false);
    }
  };
  return (
    <>
      <Panel
        className="test-account-reset"
        title="Account reset"
        description="Reset this account, then register again with the same email and details."
      >
        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <RotateCcw size={17} /> Reset account
          </Button>
        </div>
      </Panel>
      {open && (
        <Modal
          title="Reset your account?"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form className="form-stack" onSubmit={(event) => void reset(event)}>
            <p>
              This signs you out and makes <strong>{user.email}</strong>{" "}
              available for a new account. Your new account starts without
              previous orders, saved details, or memberships.
            </p>
            {user.role === "owner" && (
              <p>
                Your current business will be unpublished. You can register the
                business again.
              </p>
            )}
            <Field label="Current password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            {error && (
              <div className="form-alert reset-test-account-error" role="alert">
                {error}
              </div>
            )}
            <div className="button-row">
              <Button type="submit" busy={busy}>
                Reset and register again
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Keep this account
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
