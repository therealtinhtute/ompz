import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { markFramedBlockComponent } from "@oh-my-pi/pi-tui/render";

// =============================================================================
// UI & State types
// =============================================================================
interface RenderTheme {
	fg(colorToken: string, text: string): string;
	bold(text: string): string;
	italic(text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate?(): void;
}

interface ToolTextResult {
	content?: Array<{ type: string; text?: string }>;
	isError?: boolean;
}

interface ToolCallState {
	id: number;
	toolName: string;
	summary: string;
	isLocallyExpanded: boolean;
}

// =============================================================================
// Helper: format 1-line tool execution summary
// =============================================================================
function summarize(toolName: string, args: Record<string, unknown>): string {
	if (!args || typeof args !== "object") return "";

	if (toolName === "bash") {
		const cmd = typeof args.command === "string" ? args.command : "";
		return cmd.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
	}

	if (toolName === "todo") {
		const op = typeof args.op === "string" ? args.op : "";
		const phase = typeof args.phase === "string" ? `[${args.phase}]` : "";
		const task = typeof args.task === "string" ? args.task : "";
		const count = Array.isArray(args.items) ? `(${args.items.length} items)` : "";
		return `${op} ${phase} ${task} ${count}`.replace(/\s+/g, " ").trim();
	}

	if (toolName === "glob") {
		const p = typeof args.path === "string" ? args.path : "*";
		return p.trim();
	}

	if (toolName === "grep") {
		const pat = typeof args.pattern === "string" ? `/${args.pattern}/` : "";
		const p = typeof args.path === "string" ? ` in ${args.path}` : "";
		return `${pat}${p}`.trim();
	}

	return "";
}

// =============================================================================
// State tracking per individual tool call
// =============================================================================
let toolCounter = 0;
const toolStateMap = new WeakMap<object, ToolCallState>();
const toolHistory: ToolCallState[] = [];

function getOrCreateToolState(toolName: string, args: Record<string, unknown>): ToolCallState | undefined {
	if (!args || typeof args !== "object") return undefined;

	let state = toolStateMap.get(args);
	if (!state) {
		const id = ++toolCounter;
		state = {
			id,
			toolName,
			summary: summarize(toolName, args),
			isLocallyExpanded: false,
		};
		toolStateMap.set(args, state);
		toolHistory.push(state);
		if (toolHistory.length > 50) toolHistory.shift();
	}
	return state;
}

// =============================================================================
// Helper: 1-line Component for tool call header (No Background when collapsed)
// =============================================================================
function createSingleLineComponent(
	toolName: string,
	args: Record<string, unknown>,
	options: { expanded: boolean; isPartial: boolean; executionStarted?: boolean; isError?: boolean },
	theme: RenderTheme,
): RenderComponent {
	const state = getOrCreateToolState(toolName, args);
	const isExpanded = options.expanded || options.isError === true || (state?.isLocallyExpanded ?? false);
	const marker = isExpanded ? "▾" : "▸";
	const statusColor = options.isError ? "error" : options.isPartial ? "warning" : "success";
	const detail = state ? state.summary : summarize(toolName, args);
	const idTag = state ? theme.fg("dim", ` #${state.id}`) : "";
	const running = options.isPartial && options.executionStarted ? theme.fg("dim", " · running") : "";

	// markFramedBlockComponent eliminates background tint and outer padding
	return markFramedBlockComponent({
		render(width: number): string[] {
			const markerStr = theme.fg(statusColor, marker);
			const titleStr = theme.bold(theme.fg("toolTitle", toolName));
			const detailStr = detail ? ` ${theme.fg("dim", detail)}` : "";
			const rawLine = `${markerStr} ${titleStr}${detailStr}${idTag}${running}`;

			if (width > 4 && rawLine.length > width) {
				return [rawLine.slice(0, width - 1) + "…"];
			}
			return [rawLine];
		},
		invalidate() {},
	});
}

// =============================================================================
// Helper: Component for tool result output
// =============================================================================
function createResultComponent(
	result: ToolTextResult,
	options: { expanded: boolean },
	theme: RenderTheme,
	args?: Record<string, unknown>,
): RenderComponent {
	const state = args && typeof args === "object" ? toolStateMap.get(args) : undefined;
	const isExpanded = options.expanded || result.isError === true || (state?.isLocallyExpanded ?? false);

	// When collapsed, render nothing so transcript stays 1-line
	if (!isExpanded) {
		return markFramedBlockComponent({
			render: () => [],
			invalidate: () => {},
		});
	}

	// When expanded (globally via Ctrl+O or locally via /expand [id]), show output
	return markFramedBlockComponent({
		render(_width: number): string[] {
			const text = result.content?.find(c => c.type === "text")?.text ?? "";
			if (!text) return [];
			const colorToken = result.isError ? "error" : "toolOutput";
			return text.split("\n").map(line => theme.fg(colorToken, line));
		},
		invalidate() {},
	});
}

// =============================================================================
// Extension Entrypoint: Re-register tools with compact renderers & per-tool toggle
// =============================================================================
export default function compactToolsExtension(pi: ExtensionAPI) {
	const { Type } = pi.typebox;

	// Reset state when session starts
	pi.on("session_start", () => {
		toolCounter = 0;
		toolHistory.length = 0;
	});

	// Slash Command /expand or /x để mở/đóng từng tool hoặc mở picker chọn
	pi.registerCommand("expand", {
		description: "Mở rộng hoặc thu gọn output của từng tool call: /expand [id|all|none]",
		getArgumentCompletions: prefix => {
			const items = [
				{ value: "all", label: "all - Mở rộng toàn bộ tool call" },
				{ value: "none", label: "none - Thu gọn toàn bộ tool call" },
				...toolHistory.slice(-10).reverse().map(t => ({
					value: String(t.id),
					label: `#${t.id} ${t.isLocallyExpanded ? "▾" : "▸"} ${t.toolName} ${t.summary.slice(0, 30)}`,
				})),
			];
			return items.filter(i => i.value.startsWith(prefix.trim().toLowerCase()));
		},
		handler: async (rawArgs, ctx) => {
			const arg = (rawArgs ?? "").trim().toLowerCase();

			if (arg === "all") {
				for (const t of toolHistory) t.isLocallyExpanded = true;
				ctx.ui.setToolsExpanded(true);
				ctx.ui.notify("Đã mở rộng tất cả tool call", "info");
				return;
			}

			if (arg === "none") {
				for (const t of toolHistory) t.isLocallyExpanded = false;
				ctx.ui.setToolsExpanded(false);
				ctx.ui.notify("Đã thu gọn tất cả tool call", "info");
				return;
			}

			const num = Number.parseInt(arg, 10);
			if (!Number.isNaN(num)) {
				const target = toolHistory.find(t => t.id === num);
				if (target) {
					target.isLocallyExpanded = !target.isLocallyExpanded;
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Tool #${num} (${target.toolName}): ${target.isLocallyExpanded ? "Mở rộng" : "Thu gọn"}`, "info");
					return;
				}
				ctx.ui.notify(`Không tìm thấy tool call #${num}`, "warning");
				return;
			}

			// Không truyền số ID -> Nếu có lệnh gần nhất thì toggle nhanh lệnh đó!
			if (toolHistory.length === 0) {
				ctx.ui.notify("Chưa có tool call nào trong phiên làm việc này", "info");
				return;
			}
			const latest = toolHistory[toolHistory.length - 1];
			if (latest && arg === "") {
				latest.isLocallyExpanded = !latest.isLocallyExpanded;
				ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
				ctx.ui.notify(`Tool gần nhất #${latest.id} (${latest.toolName}): ${latest.isLocallyExpanded ? "Mở rộng" : "Thu gọn"} (gõ /x <số> để mở lệnh khác)`, "info");
				return;
			}

			const selectItems = toolHistory.slice(-20).reverse().map(t => ({
				label: `#${t.id} ${t.isLocallyExpanded ? "▾ [MỞ]" : "▸ [GỌN]"} ${t.toolName} ${t.summary.slice(0, 45)}`,
				description: t.isLocallyExpanded ? "Đang mở -> Chọn để thu gọn" : "Đang thu gọn -> Chọn để mở rộng",
				value: String(t.id),
			}));

			const chosen = await ctx.ui.select("Chọn tool call để Mở rộng / Thu gọn:", selectItems);
			if (chosen) {
				const chosenNum = Number.parseInt(chosen, 10);
				const target = toolHistory.find(t => t.id === chosenNum);
				if (target) {
					target.isLocallyExpanded = !target.isLocallyExpanded;
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Tool #${chosenNum} (${target.toolName}): ${target.isLocallyExpanded ? "Mở rộng" : "Thu gọn"}`, "info");
				}
			}
		},
	});
	// Alias /x ngắn gọn
	pi.registerCommand("x", {
		description: "Mở rộng hoặc thu gọn output: /x [id|all|none]",
		handler: async (rawArgs, ctx) => {
			const expandCmd = pi.getCommands().find(c => c.name === "expand");
			if (expandCmd) {
				// Chuyển tiếp sang handler của /expand
				const target = (rawArgs ?? "").trim();
				const num = Number.parseInt(target, 10);
				if (!Number.isNaN(num)) {
					const tool = toolHistory.find(t => t.id === num);
					if (tool) {
						tool.isLocallyExpanded = !tool.isLocallyExpanded;
						ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
						ctx.ui.notify(`Tool #${num} (${tool.toolName}): ${tool.isLocallyExpanded ? "Mở rộng" : "Thu gọn"}`, "info");
						return;
					}
				}
				if (toolHistory.length === 0) {
					ctx.ui.notify("Chưa có tool call nào", "info");
					return;
				}
				const latest = toolHistory[toolHistory.length - 1];
				if (latest && target === "") {
					latest.isLocallyExpanded = !latest.isLocallyExpanded;
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Tool gần nhất #${latest.id} (${latest.toolName}): ${latest.isLocallyExpanded ? "Mở rộng" : "Thu gọn"}`, "info");
				}
			}
		},
	});

	// Shortcut Alt+O để mở nhanh picker chọn tool cần xem
	pi.registerShortcut("alt+o", {
		description: "Mở menu chọn tool call để mở rộng hoặc thu gọn",
		handler: async ctx => {
			if (toolHistory.length === 0) {
				ctx.ui.notify("Chưa có tool call nào", "info");
				return;
			}
			const selectItems = toolHistory.slice(-20).reverse().map(t => ({
				label: `#${t.id} ${t.isLocallyExpanded ? "▾ [MỞ]" : "▸ [GỌN]"} ${t.toolName} ${t.summary.slice(0, 45)}`,
				description: t.isLocallyExpanded ? "Đang mở -> Chọn để thu gọn" : "Đang thu gọn -> Chọn để mở rộng",
				value: String(t.id),
			}));
			const chosen = await ctx.ui.select("Chọn tool call để Mở rộng / Thu gọn:", selectItems);
			if (chosen) {
				const chosenNum = Number.parseInt(chosen, 10);
				const target = toolHistory.find(t => t.id === chosenNum);
				if (target) {
					target.isLocallyExpanded = !target.isLocallyExpanded;
					ctx.ui.setToolsExpanded(ctx.ui.getToolsExpanded());
					ctx.ui.notify(`Tool #${chosenNum} (${target.toolName}): ${target.isLocallyExpanded ? "Mở rộng" : "Thu gọn"}`, "info");
				}
			}
		},
	});

	// 1. Shadow BASH
	pi.registerTool({
		name: "bash",
		label: "bash",
		description: "Execute bash commands in a persistent shell",
		approval: "exec",
		parameters: Type.Object({
			command: Type.String({ description: "Command to execute" }),
			timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
			cwd: Type.Optional(Type.String({ description: "Working directory" })),
			pty: Type.Optional(Type.Boolean({ description: "Interactive PTY mode" })),
			async: Type.Optional(Type.Boolean({ description: "Run asynchronously" })),
			name: Type.Optional(Type.String({ description: "Service/daemon name" })),
			ready: Type.Optional(Type.Unknown()),
			i: Type.Optional(Type.String({ description: "Intent tracing note" })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			return ctx.invokeTool(params, { signal, onUpdate });
		},
		renderCall: (args, options, theme) => createSingleLineComponent("bash", args, options, theme),
		renderResult: (result, options, theme, args) => createResultComponent(result, options, theme, args),
	});

	// 2. Shadow TODO
	pi.registerTool({
		name: "todo",
		label: "todo",
		description: "Track task progress and checklists",
		approval: "write",
		parameters: Type.Object({
			op: Type.String({ description: "init|start|done|rm|drop|block|unblock|append|view" }),
			task: Type.Optional(Type.String()),
			phase: Type.Optional(Type.String()),
			items: Type.Optional(Type.Array(Type.String())),
			list: Type.Optional(Type.Unknown()),
			reason: Type.Optional(Type.String()),
			i: Type.Optional(Type.String({ description: "Intent tracing note" })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			return ctx.invokeTool(params, { signal, onUpdate });
		},
		renderCall: (args, options, theme) => createSingleLineComponent("todo", args, options, theme),
		renderResult: (result, options, theme, args) => createResultComponent(result, options, theme, args),
	});

	// 3. Shadow GLOB
	pi.registerTool({
		name: "glob",
		label: "glob",
		description: "Find files matching a glob pattern",
		approval: "read",
		parameters: Type.Object({
			path: Type.Optional(Type.String()),
			hidden: Type.Optional(Type.Boolean()),
			gitignore: Type.Optional(Type.Boolean()),
			limit: Type.Optional(Type.Number()),
			i: Type.Optional(Type.String({ description: "Intent tracing note" })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			return ctx.invokeTool(params, { signal, onUpdate });
		},
		renderCall: (args, options, theme) => createSingleLineComponent("glob", args, options, theme),
		renderResult: (result, options, theme, args) => createResultComponent(result, options, theme, args),
	});

	// 4. Shadow GREP
	pi.registerTool({
		name: "grep",
		label: "grep",
		description: "Search file contents by regex pattern",
		approval: "read",
		parameters: Type.Object({
			pattern: Type.String(),
			path: Type.Optional(Type.String()),
			case: Type.Optional(Type.Boolean()),
			gitignore: Type.Optional(Type.Boolean()),
			skip: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
			i: Type.Optional(Type.String({ description: "Intent tracing note" })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			return ctx.invokeTool(params, { signal, onUpdate });
		},
		renderCall: (args, options, theme) => createSingleLineComponent("grep", args, options, theme),
		renderResult: (result, options, theme, args) => createResultComponent(result, options, theme, args),
	});
}
