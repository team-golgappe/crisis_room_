import AppShell from "../../components/AppShell";

export const metadata = { title: "Dashboard — Crisis Room" };

export default function AppLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
