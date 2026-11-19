"use client";

import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizeLoginEmail } from "./normalizeLoginEmail";

export default function LoginPage() {
  const supabase = supabaseBrowser();

  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = normalizeLoginEmail(String(fields.get("email") ?? ""));
    const password = String(fields.get("password") ?? "");
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");

    if (action === "signup") {
      setStatus("Registriere...");
      const { error } = await supabase.auth.signUp({ email, password });
      setStatus(error ? error.message : "Registriert ✅ (ggf. E-Mail bestätigen)");
      return;
    }

    setStatus("Logge ein...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Eingeloggt ✅");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-soft p-6 bg-surface shadow-soft">
        <h1 className="text-2xl font-semibold">Login</h1>

        <label htmlFor="login-email" className="block text-sm font-medium mt-6">E-Mail</label>
        <input
          id="login-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-xl border p-3"
          placeholder="ramona@email.de"
        />

        <label htmlFor="login-password" className="block text-sm font-medium mt-4">Passwort</label>
        <input
          id="login-password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border p-3"
          placeholder="********"
        />

        <button
          type="submit"
          value="signin"
          className="mt-6 w-full rounded-xl bg-accent-primary text-on-accent p-3 disabled:opacity-60"
        >
          Einloggen
        </button>

        <button
          type="submit"
          value="signup"
          className="mt-3 w-full rounded-xl border p-3 disabled:opacity-50"
        >
          Registrieren
        </button>

        {status && <p className="mt-4 text-sm">{status}</p>}
      </form>
    </main>
  );
}
