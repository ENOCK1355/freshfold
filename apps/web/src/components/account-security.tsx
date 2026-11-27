import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { dashboard, send, useAction, useApp } from "../lib";
import { Button, ButtonLink, Field, Panel, PageHead } from "./ui";

export function PasswordChange() {
  const { run, busy } = useAction();
  return (
    <Panel title="Password & security">
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          void run(async () => {
            if (fields.get("password") !== fields.get("confirm"))
              throw new Error("Your new passwords do not match.");
            await send("account/password", {
              current: fields.get("current"),
              password: fields.get("password"),
            });
            form.reset();
          }, "Password changed. Your other sessions have been signed out.");
        }}
      >
        <Field label="Current password">
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
          />
        </Field>
        <Field label="New password">
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
          />
        </Field>
        <Button type="submit" busy={busy}>
          Change password
        </Button>
      </form>
    </Panel>
  );
}
export function PasswordRecovery() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const { run, busy } = useAction(),
    { refresh } = useApp();
  const [complete, setComplete] = useState(false);
  const token = params.get("token");
  return (
    <section className="container section recovery-page">
      <PageHead
        title={token ? "Choose a new password" : "Let's get you back in"}
      />
      <Panel>
        {complete ? (
          <p>Your password has been updated.</p>
        ) : token ? (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                if (form.get("password") !== form.get("confirm"))
                  throw new Error("Your passwords do not match.");
                await send("auth/recovery-complete", {
                  token,
                  password: form.get("password"),
                });
                await refresh();
                setComplete(true);
                const me = await import("../lib").then((module) =>
                  module.api("auth/me"),
                );
                navigate(dashboard(me.user?.role), { replace: true });
              }, "Password updated.");
            }}
          >
            <Field label="New password" hint="Use at least 12 characters.">
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Button type="submit" busy={busy}>
              Save new password
            </Button>
          </form>
        ) : (
          <>
            <p>
              Contact Fresh Fold support on WhatsApp. After checking your
              account details, our team can provide a private recovery link.
            </p>
            <ButtonLink to="/contact">Contact support</ButtonLink>
          </>
        )}
      </Panel>
    </section>
  );
}
