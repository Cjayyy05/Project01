"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { useAuth } from "@/context/auth-context";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [router, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length === 0 || password.length > 128) {
      setError("Enter your password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await login(normalizedEmail, password);
      router.replace("/dashboard");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="Use the account connected to your DeployFlow instance."
      eyebrow="Welcome back"
      footerHref="/register"
      footerLabel="Create one"
      footerPrompt="Need an account?"
      title="Sign in to continue"
    >
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {error !== null ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <label className="block text-sm font-medium text-slate-800">
          Email address
          <input
            autoComplete="email"
            className="form-input"
            disabled={isSubmitting}
            inputMode="email"
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Password
          <input
            autoComplete="current-password"
            className="form-input"
            disabled={isSubmitting}
            maxLength={128}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button
          className="button-primary w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
