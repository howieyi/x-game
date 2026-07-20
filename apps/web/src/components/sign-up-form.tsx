import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@x-game/ui/components/button";
import { Input } from "@x-game/ui/components/input";
import { Label } from "@x-game/ui/components/label";
import { toast } from "sonner";
import z from "zod";

import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

const fieldClass =
	"border-white/[0.07] bg-white/[0.025] text-white placeholder:text-white/30 focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/15";

export default function SignUpForm({
	onSwitchToSignIn,
}: {
	onSwitchToSignIn: () => void;
}) {
	const navigate = useNavigate({
		from: "/",
	});
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			name: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: value.name,
				},
				{
					onSuccess: () => {
						// Surface the new account to ops alongside other
						// behavioural signals — same alert pipeline.
						track({
							eventType: "signup",
							eventName: "user_signup",
							properties: {
								email_domain: value.email.split("@")[1] ?? "",
							},
						});
						navigate({
							to: "/",
						});
						toast.success("注册成功");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, "昵称至少 2 个字符"),
				email: z.email("邮箱格式不正确"),
				password: z.string().min(8, "密码至少 8 位"),
			}),
		},
	});

	if (isPending) {
		return <Loader />;
	}

	return (
		<div>
			<p className="mb-6 text-sm text-white/55">
				填写昵称、邮箱和密码加入 NEXUS
			</p>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<form.Field name="name">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name} className="text-white/70">
								昵称
							</Label>
							<Input
								id={field.name}
								name={field.name}
								placeholder="你的昵称"
								className={fieldClass}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="text-red-400 text-sm">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name} className="text-white/70">
								邮箱
							</Label>
							<Input
								id={field.name}
								name={field.name}
								type="email"
								placeholder="you@example.com"
								className={fieldClass}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="text-red-400 text-sm">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="password">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name} className="text-white/70">
								密码
							</Label>
							<Input
								id={field.name}
								name={field.name}
								type="password"
								placeholder="至少 8 位"
								className={fieldClass}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="text-red-400 text-sm">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							type="submit"
							className="w-full bg-[#d9ff43] font-bold text-black shadow-[0_0_24px_rgba(217,255,67,0.35)] transition hover:bg-[#c4f02e] disabled:opacity-50"
							disabled={!canSubmit || isSubmitting}
						>
							{isSubmitting ? "注册中..." : "注册"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-5 text-center text-sm text-white/45">
				已有账号？
				<button
					type="button"
					onClick={onSwitchToSignIn}
					className="ml-1 font-medium text-[#d9ff43] transition-colors hover:text-[#c4f02e]"
				>
					去登录
				</button>
			</div>
		</div>
	);
}
