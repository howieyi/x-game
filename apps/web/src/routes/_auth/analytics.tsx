import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	Eye,
	MousePointerClick,
	Users,
} from "lucide-react";
import { useState } from "react";

import SegmentedControl from "@/components/segmented-control";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/analytics")({
	component: AnalyticsDashboard,
});

const TYPE_LABELS: Record<string, string> = {
	page_view: "页面浏览",
	click: "点击",
	performance: "性能",
	error: "异常",
	visibility: "可见性",
};

const RANGE_OPTIONS = [
	{ value: 1, label: "今天" },
	{ value: 7, label: "7 天" },
	{ value: 30, label: "30 天" },
] as const;

const METRIC_CARDS = [
	{
		key: "total",
		label: "总事件",
		Icon: Activity,
		accent: "text-cyan-300",
		hue: "from-cyan-400/15",
	},
	{
		key: "visitors",
		label: "访客",
		Icon: Eye,
		accent: "text-violet-300",
		hue: "from-violet-400/15",
	},
	{
		key: "sessions",
		label: "会话",
		Icon: Users,
		accent: "text-emerald-300",
		hue: "from-emerald-400/15",
	},
	{
		key: "errors",
		label: "异常",
		Icon: AlertTriangle,
		accent: "text-rose-300",
		hue: "from-rose-400/15",
	},
] as const;

function AnalyticsDashboard() {
	const [days, setDays] = useState<number>(7);

	const overview = useQuery(trpc.analytics.overview.queryOptions({ days }));
	const recent = useQuery(trpc.analytics.recent.queryOptions({ limit: 30 }));
	const data = overview.data;
	const maxTrend = Math.max(
		1,
		...(data?.trend.map((item) => item.events) ?? [1]),
	);
	const maxType = Math.max(
		1,
		...(data?.types.map((item) => item.value ?? 0) ?? [1]),
	);

	return (
		<section>
			<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
						<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
						Behavior · Analytics
					</p>
					<h1 className="mt-3 font-black text-3xl tracking-[-0.04em] md:text-4xl">
						行为分析中心
					</h1>
					<p className="mt-2 max-w-xl text-sm text-white/42 leading-6">
						页面浏览、点击路径、用户会话、Web Vitals 与异常事件
					</p>
				</div>
				<SegmentedControl<number>
					label="时间范围"
					options={RANGE_OPTIONS}
					value={days}
					onChange={setDays}
				/>
			</div>

			{overview.isLoading ? (
				<div className="grid min-h-72 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.015] text-sm text-white/40">
					正在聚合行为数据…
				</div>
			) : (
				<>
					<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{METRIC_CARDS.map(({ key, label, Icon, accent, hue }) => (
							<div
								key={key}
								className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
							>
								<span
									aria-hidden="true"
									className={`pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full bg-gradient-to-br ${hue} to-transparent opacity-60 blur-2xl`}
								/>
								<div className="relative">
									<div className="flex items-center justify-between">
										<Icon className={accent} size={18} />
										<span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
											{label}
										</span>
									</div>
									<p className="mt-6 font-black text-3xl tabular-nums">
										{Number(data?.summary?.[key] ?? 0).toLocaleString("en-US")}
									</p>
									<p className="mt-1 text-[10px] text-white/35 uppercase tracking-[0.18em]">
										Past {days === 1 ? "day" : `${days} days`}
									</p>
								</div>
							</div>
						))}
					</section>

					<section className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<div className="flex items-end justify-between">
								<div>
									<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
										Trend
									</p>
									<h2 className="mt-1 font-bold text-xl">事件趋势</h2>
								</div>
								<p className="text-[10px] text-white/30 uppercase tracking-[0.18em]">
									Daily
								</p>
							</div>
							<div className="mt-8 flex h-52 items-end gap-3">
								{data?.trend.length ? (
									data.trend.map((item) => (
										<div
											key={item.day}
											className="flex min-w-0 flex-1 flex-col items-center gap-2"
										>
											<span className="text-[10px] text-cyan-200/70 tabular-nums">
												{item.events}
											</span>
											<div
												className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/30 to-cyan-300"
												style={{
													height: `${Math.max(4, (item.events / maxTrend) * 160)}px`,
												}}
											/>
											<span className="text-[10px] text-white/30 tabular-nums">
												{item.day}
											</span>
										</div>
									))
								) : (
									<p className="m-auto text-sm text-white/30">暂无趋势数据</p>
								)}
							</div>
						</div>

						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<div className="flex items-end justify-between">
								<div>
									<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
										Composition
									</p>
									<h2 className="mt-1 font-bold text-xl">事件构成</h2>
								</div>
							</div>
							<div className="mt-6 space-y-4">
								{data?.types.map((item) => (
									<div key={item.type}>
										<div className="mb-1.5 flex justify-between text-xs">
											<span className="text-white/55">
												{TYPE_LABELS[item.type] ?? item.type}
											</span>
											<span className="tabular-nums">
												{item.value.toLocaleString("en-US")}
											</span>
										</div>
										<div className="h-1.5 rounded-full bg-white/5">
											<div
												className="h-full rounded-full bg-violet-400"
												style={{ width: `${(item.value / maxType) * 100}%` }}
											/>
										</div>
									</div>
								))}
							</div>
						</div>
					</section>

					<section className="mt-4 grid gap-4 lg:grid-cols-2">
						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<div className="flex items-end justify-between">
								<div>
									<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
										Top pages
									</p>
									<h2 className="mt-1 font-bold text-xl">热门页面</h2>
								</div>
							</div>
							<div className="mt-5 divide-y divide-white/[0.06]">
								{data?.pages.map((page) => (
									<div
										key={page.path}
										className="flex items-center justify-between gap-4 py-3"
									>
										<p className="min-w-0 truncate font-mono text-cyan-100/70 text-xs">
											{page.path}
										</p>
										<p className="shrink-0 text-white/35 text-xs tabular-nums">
											{page.views} PV · {page.visitors} UV
										</p>
									</div>
								))}
							</div>
						</div>

						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<div className="flex items-end justify-between">
								<div>
									<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
										Performance
									</p>
									<h2 className="mt-1 font-bold text-xl">性能指标</h2>
								</div>
							</div>
							<div className="mt-5 grid grid-cols-2 gap-3">
								{data?.performance.map((metric) => (
									<div
										key={metric.name}
										className="rounded-xl border border-white/[0.05] bg-black/20 p-4"
									>
										<p className="text-white/35 text-xs">{metric.name}</p>
										<p className="mt-2 font-black text-2xl text-violet-200 tabular-nums">
											{metric.p75}
											<span className="ml-1 font-normal text-[10px] text-white/30">
												{metric.name === "CLS" ? "" : "ms"}
											</span>
										</p>
										<p className="mt-1 text-[10px] text-white/25 tabular-nums">
											P75 · 平均 {metric.average}
										</p>
									</div>
								))}
							</div>
						</div>
					</section>
				</>
			)}

			<section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
				<div className="flex items-center gap-2 border-white/[0.06] border-b px-5 py-4">
					<MousePointerClick size={16} className="text-cyan-300" />
					<div>
						<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
							Live feed
						</p>
						<h2 className="mt-0.5 font-bold text-base">实时事件流</h2>
					</div>
				</div>
				<div className="max-h-[420px] overflow-auto">
					{recent.data?.map((event) => (
						<div
							key={event.id}
							className="grid gap-2 border-white/[0.05] border-b px-5 py-3 text-xs sm:grid-cols-[100px_1fr_1fr_auto]"
						>
							<span className="text-violet-300">
								{TYPE_LABELS[event.eventType] ?? event.eventType}
							</span>
							<span className="truncate text-white/65">{event.eventName}</span>
							<span className="truncate font-mono text-white/35">
								{event.path}
							</span>
							<span className="text-white/25 tabular-nums">
								{new Date(event.createdAt).toLocaleTimeString()}
							</span>
						</div>
					))}
				</div>
			</section>
		</section>
	);
}
