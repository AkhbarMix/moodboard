import React, { useState } from "react";
import { loginEmail, loginGoogle, signupEmail } from "../services/authService";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../services/firebase";

export function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const e = email.trim();
      if (!e) throw new Error("Enter your email.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      if (mode === "login") await loginEmail(e, password);
      else await signupEmail(e, password);
      // App.tsx auth listener will switch views
    } catch (err: any) {
      setError(err?.message ?? "Auth failed.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginGoogle();
    } catch (err: any) {
      setError(err?.message ?? "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
const handleResetPassword = async () => {
  if (!email) {
    setError("Enter your email first.");
    return;
  }

  setBusy(true);
  setError(null);

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent!");
  } catch (err: any) {
    console.error(err);
    setError(err?.message ?? "Failed to send reset email.");
  } finally {
    setBusy(false);
  }
};

  return (
    <div className="w-screen h-screen grid place-items-center bg-[#f5f5f7] text-gray-800 p-6">
      <div className="glass-panel w-full max-w-md p-6 rounded-2xl shadow-2xl">
        <div className="text-xl font-bold">MoodBoard By Mix 3D Design</div>
        <div className="text-sm text-gray-500 mt-1">
          {mode === "login" ? "Sign in to continue" : "Create your account"}
        </div>

        <div className="mt-5 space-y-3">
          <input
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-blue-400 bg-white/70"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-blue-400 bg-white/70"
            placeholder="Password (min 6 chars)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error && <div className="text-sm text-red-600">{error}</div>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-black text-white font-semibold disabled:opacity-60"
          >
{mode === "login" && (
  <button
    onClick={handleResetPassword}
    disabled={busy}
    className="w-full text-sm text-blue-600 hover:underline mt-2"
  >
    Forgot password?
  </button>
)}

            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <button
            onClick={google}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-white border border-gray-200 font-semibold disabled:opacity-60"
          >
            Continue with Google
          </button>

          <div className="text-sm text-gray-600 mt-2">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button className="underline" onClick={() => setMode("signup")}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button className="underline" onClick={() => setMode("login")}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
