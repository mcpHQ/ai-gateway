import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { accountExists } from "@/lib/account";

export default async function SignupPage() {
  if (await accountExists()) {
    return (
      <div className="panel p-8">
        <Link href="/" className="text-sm text-muted-foreground">
          Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Account already created</h1>
        <p className="mt-2 text-sm text-muted-foreground">This installation already has its account. Sign in with that email.</p>
        <Link href="/login" className="mt-6 inline-flex btn-primary">
          Sign in
        </Link>
      </div>
    );
  }
  return <SignupForm />;
}
