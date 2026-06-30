import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@x-game/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@x-game/ui/components/card";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

type FeatureCardProps = {
	title: string;
	description: string;
	href: string;
	ctaLabel: string;
};

function FeatureCard({ title, description, href, ctaLabel }: FeatureCardProps) {
	return (
		<Link
			to={href}
			className="group block rounded-lg outline-none transition-colors hover:[&_[data-slot=card]]:border-foreground/30 focus-visible:[&_[data-slot=card]]:border-foreground/40"
		>
			<Card className="h-full transition-colors group-hover:border-foreground/30">
				<CardHeader>
					<CardTitle className="text-base">{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>
					<span className="text-foreground text-sm underline-offset-4 group-hover:underline">
						{ctaLabel}
					</span>
				</CardContent>
			</Card>
		</Link>
	);
}

function HomeComponent() {
	const healthCheck = useQuery(trpc.healthCheck.queryOptions());
	const { data: session } = authClient.useSession();
	const isLoggedIn = Boolean(session?.user);

	return (
		<div className="container mx-auto max-w-5xl px-4 py-2">
			<pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>

			<section className="mt-8 mb-10 flex flex-col gap-4">
				<h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
					欢迎来到 x-game
				</h1>
				<p className="text-muted-foreground text-sm md:text-base">
					{isLoggedIn && session?.user.name
						? `欢迎回来，${session.user.name}`
						: "翻牌挑战 · 记录战绩 · 与全球玩家同台竞技"}
				</p>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link to="/game">
						<Button>开始挑战 →</Button>
					</Link>
					<Link to="/leaderboard">
						<Button variant="outline">查看排行榜</Button>
					</Link>
				</div>
				{!isLoggedIn && (
					<div className="text-muted-foreground text-xs">
						<span>登录后可保存成绩并上榜 · </span>
						<Link to="/login" className="inline-flex">
							<Button variant="ghost" size="sm">
								前往登录
							</Button>
						</Link>
					</div>
				)}
			</section>

			<section
				aria-label="特性介绍"
				className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3"
			>
				<FeatureCard
					title="记忆翻牌"
					description="4×4 牌阵，7 种主题，翻牌配对比拼手速与记忆力。"
					href="/game"
					ctaLabel="开始挑战 →"
				/>
				{isLoggedIn ? (
					<FeatureCard
						title="我的战绩"
						description="按主题分别追踪最佳步数、用时与三星次数。"
						href="/stats"
						ctaLabel="查看战绩 →"
					/>
				) : (
					<FeatureCard
						title="我的战绩"
						description="登录后查看战绩：按主题分别追踪最佳步数、用时与三星次数。"
						href="/login"
						ctaLabel="登录后查看 →"
					/>
				)}
				<FeatureCard
					title="全球排行榜"
					description="按主题 Top 10 排名，步数升序、相同时长决胜。"
					href="/leaderboard"
					ctaLabel="查看排行榜 →"
				/>
			</section>

			<div className="grid gap-6">
				<section className="rounded-lg border p-4">
					<h2 className="mb-2 font-medium">API Status</h2>
					<div className="flex items-center gap-2">
						<div
							className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
						/>
						<span className="text-muted-foreground text-sm">
							{healthCheck.isLoading
								? "Checking..."
								: healthCheck.data
									? "Connected"
									: "Disconnected"}
						</span>
					</div>
				</section>
			</div>
		</div>
	);
}
