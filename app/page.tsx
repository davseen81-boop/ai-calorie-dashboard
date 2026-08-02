import { redirect } from "next/navigation";

/** The dashboard is the app's home; there is no marketing page to show. */
export default function RootPage() {
  redirect("/dashboard");
}
