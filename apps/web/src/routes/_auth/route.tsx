import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import ConsoleShell from "@/components/console-shell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
			});
		}
		return { session };
	},
});

function AuthLayout() {
	return (
		<ConsoleShell>
			<Outlet />
		</ConsoleShell>
	);
}
