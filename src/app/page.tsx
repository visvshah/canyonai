import Link from "next/link";

// Landing page doesn’t need server components yet.
// TODO: integrate session check once auth is wired in.

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#091625] p-6 text-center text-white">
      
      <p className="max-w-xl text-lg md:text-2xl">
        Canyon makes quoting and approvals effortless for modern SaaS sales
        teams.
      </p>
      <Link
        href="/api/auth/signin"
        className="rounded bg-white px-6 py-3 font-semibold text-[#091625] shadow transition hover:brightness-95"
      >
        Sign in with Google
      </Link>
    </div>
  );
}
