"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function signUp() {
    setStatus("Registriere...");
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Registriert ✅ (ggf. E-Mail bestätigen)");
  }

  async function signIn() {
    setStatus("Logge ein...");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Eingeloggt ✅");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-soft p-6 bg-surface shadow-soft">
        <h1 className="text-2xl font-semibold">Login</h1>

        <label className="block text-sm font-medium mt-6">E-Mail</label>
        <input
          className="mt-1 w-full rounded-xl border p-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ramona@email.de"
        />

        <label className="block text-sm font-medium mt-4">Passwort</label>
        <input
          type="password"
          className="mt-1 w-full rounded-xl border p-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="********"
        />

        <button
          className="mt-6 w-full rounded-xl bg-accent-primary text-on-accent p-3 disabled:opacity-60"
          onClick={signIn}
          disabled={!email || !password}
        >
          Einloggen
        </button>

        <button
          className="mt-3 w-full rounded-xl border p-3 disabled:opacity-50"
          onClick={signUp}
          disabled={!email || !password}
        >
          Registrieren
        </button>

        {status && <p className="mt-4 text-sm">{status}</p>}
      </div>
    </main>
  );
}
