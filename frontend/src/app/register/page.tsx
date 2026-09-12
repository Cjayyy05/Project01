"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { useAuth } from "@/context/auth-context";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { register, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (!VALID_PASSWORD_PATTERN.test(password)) {
      setError("Use 8 to 128 characters with at least one letter and one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await register(normalizedEmail, password);
      router.replace("/dashboard");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create your account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="Create the account that will own your projects and deployments."
      eyebrow="Get started"
      footerHref="/login"
      footerLabel="Sign in"
      footerPrompt="Already have an account?"
      title="Create your account"
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
            aria-describedby="password-help"
            autoComplete="new-password"
            className="form-input"
            disabled={isSubmitting}
            maxLength={128}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <span
            className="mt-2 block text-xs leading-5 text-slate-500"
            id="password-help"
          >
            8–128 characters, including at least one letter and one number.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Confirm password
          <input
            autoComplete="new-password"
            className="form-input"
            disabled={isSubmitting}
            maxLength={128}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        <button
          className="button-primary w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-xs leading-5 text-slate-500">
          Registration may be disabled by the DeployFlow operator. Existing
          accounts can still sign in.
        </p>
      </form>
    </AuthShell>
  );
}
