"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { authApi, setToken } from "@/lib/api/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: { theme: string; size: string; width?: number }) => void;
        };
      };
    };
  }
}

export default function AuthPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [form, setForm] = useState({ username: "", email: "", password: "", display_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) {
            setError("Google did not return a credential");
            return;
          }
          try {
            const result = await authApi.google(response.credential);
            setToken(result.accessToken);
            router.push("/profile");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google login failed");
          }
        }
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 340
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.head.appendChild(script);
  }, [googleClientId, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authApi.signup(form)
          : await authApi.login({ email: form.email, password: form.password });
      setToken(result.accessToken);
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <section className="surface mx-auto max-w-md rounded-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="block h-10 w-10 overflow-hidden rounded-xl">
          <img src="/logo.svg" alt="" className="h-full w-full object-cover" />
        </span>
        <span className="text-lg font-bold text-asphalt">Car Social</span>
      </div>
      <h1 className="text-2xl font-bold">{mode === "signup" ? "Create your garage" : "Log in"}</h1>
      <div className="mt-6">
        {googleClientId ? (
          <div ref={googleButtonRef} />
        ) : (
          <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
            Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and backend `GOOGLE_CLIENT_ID` to enable Google sign-in.
          </p>
        )}
      </div>
      <div className="my-5 text-center text-xs uppercase tracking-wide text-slate-500">or use email</div>
      <form className="space-y-4" onSubmit={submit}>
        {mode === "signup" && (
          <>
            <input
              className="input"
              placeholder="Username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
            <input
              className="input"
              placeholder="Display name"
              value={form.display_name}
              onChange={(event) => setForm({ ...form, display_name: event.target.value })}
            />
          </>
        )}
        <input
          className="input"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full px-4 py-3 disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
        </button>
      </form>
      <button
        className="mt-4 text-sm font-medium text-petrol"
        onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        type="button"
      >
        {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
      </button>
    </section>
  );
}
