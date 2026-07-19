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

import PageShell from "@/components/page-shell";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/analytics")({
	component: AnalyticsDashboard,
});

const typeLabels: Record<string, string> = {
	page_view: "页面浏览",
	click: "点击",
	performance: "性能",
	error: "异常",
	visibility: "可见性",
};

function AnalyticsDashboard() {
	const [days, setDays] = useState(7);
	const overview = useQuery(trpc.analytics.overview.queryOptions({ days }));
	const recent = useQuery(trpc.analytics.recent.queryOptions({ limit: 30 }));
	const data = overview.data;
	const maxTrend = Math.max(
		1,
		...(data?.trend.map((item) => item.events) ?? [1]),
	);
	const maxType = Math.max(
		1,
		...(data?.types.map((item) => item.value) ?? [1]),
	);

	return (
		<PageShell
			title="行为分析中心"
			subtitle="页面浏览、点击路径、用户会话、Web Vitals 与异常事件"
			maxWidth="5xl"
		>
			<div className="mb-6 flex justify-end gap-2">
				{[1, 7, 30].map((value) => (
					<button
						type="button"
						key={value}
						onClick={() => setDays(value)}
						className={`rounded-full px-4 py-2 text-xs transition ${
							days === value
								? "bg-cyan-300 font-bold text-black"
								: "border border-white/10 bg-white/[0.03] text-white/55"
						}`}
					>
						{value === 1 ? "今天" : `${value} 天`}
					</button>
				))}
			</div>

			{overview.isLoading ? (
				<div className="grid min-h-72 place-items-center text-white/40">
					正在聚合行为数据…
				</div>
			) : (
				<>
					<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{[
							["总事件", data?.summary.total ?? 0, Activity, "text-cyan-300"],
							["访客", data?.summary.visitors ?? 0, Eye, "text-violet-300"],
							["会话", data?.summary.sessions ?? 0, Users, "text-emerald-300"],
							[
								"异常",
								data?.summary.errors ?? 0,
								AlertTriangle,
								"text-rose-300",
							],
						].map(([label, value, Icon, color]) => {
							const MetricIcon = Icon as typeof Activity;
							return (
								<div
									key={String(label)}
									className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
								>
									<MetricIcon className={String(color)} size={18} />
									<p className="mt-6 font-black text-3xl">{String(value)}</p>
									<p className="mt-1 text-white/35 text-xs">{String(label)}</p>
								</div>
							);
						})}
					</section>

					<section className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<h2 className="font-semibold">事件趋势</h2>
							<div className="mt-8 flex h-52 items-end gap-3">
								{data?.trend.length ? (
									data.trend.map((item) => (
										<div
											key={item.day}
											className="flex min-w-0 flex-1 flex-col items-center gap-2"
										>
											<span className="text-[10px] text-cyan-200/70">
												{item.events}
											</span>
											<div
												className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/30 to-cyan-300"
												style={{
													height: `${Math.max(4, (item.events / maxTrend) * 160)}px`,
												}}
											/>
											<span className="text-[10px] text-white/30">
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
							<h2 className="font-semibold">事件构成</h2>
							<div className="mt-6 space-y-4">
								{data?.types.map((item) => (
									<div key={item.type}>
										<div className="mb-1.5 flex justify-between text-xs">
											<span className="text-white/55">
												{typeLabels[item.type] ?? item.type}
											</span>
											<span>{item.value}</span>
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
							<h2 className="font-semibold">热门页面</h2>
							<div className="mt-5 divide-y divide-white/[0.06]">
								{data?.pages.map((page) => (
									<div
										key={page.path}
										className="flex items-center justify-between gap-4 py-3"
									>
										<p className="min-w-0 truncate font-mono text-cyan-100/70 text-xs">
											{page.path}
										</p>
										<p className="shrink-0 text-white/35 text-xs">
											{page.views} PV · {page.visitors} UV
										</p>
									</div>
								))}
							</div>
						</div>

						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
							<h2 className="font-semibold">性能指标</h2>
							<div className="mt-5 grid grid-cols-2 gap-3">
								{data?.performance.map((metric) => (
									<div key={metric.name} className="rounded-xl bg-black/20 p-4">
										<p className="text-white/35 text-xs">{metric.name}</p>
										<p className="mt-2 font-black text-2xl text-violet-200">
											{metric.p75}
											<span className="ml-1 font-normal text-[10px] text-white/30">
												{metric.name === "CLS" ? "" : "ms"}
											</span>
										</p>
										<p className="mt-1 text-[10px] text-white/25">
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
					<h2 className="font-semibold">实时事件流</h2>
				</div>
				<div className="max-h-[420px] overflow-auto">
					{recent.data?.map((event) => (
						<div
							key={event.id}
							className="grid gap-2 border-white/[0.05] border-b px-5 py-3 text-xs sm:grid-cols-[100px_1fr_1fr_auto]"
						>
							<span className="text-violet-300">
								{typeLabels[event.eventType]}
							</span>
							<span className="truncate text-white/65">{event.eventName}</span>
							<span className="truncate font-mono text-white/35">
								{event.path}
							</span>
							<span className="text-white/25">
								{new Date(event.createdAt).toLocaleTimeString()}
							</span>
						</div>
					))}
				</div>
			</section>
		</PageShell>
	);
}
