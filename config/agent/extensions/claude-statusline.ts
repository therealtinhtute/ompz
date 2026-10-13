import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { execSync } from "child_process";

export default function claudeStatusLine(pi: ExtensionAPI) {
  let sessionStartTime = Date.now();

  function getGitBranch(cwd: string): string {
    try {
      const branch = execSync("git --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null", {
        cwd,
        encoding: "utf-8",
        timeout: 1000,
      }).trim();
      if (branch === "HEAD") {
        return execSync("git --no-optional-locks rev-parse --short HEAD 2>/dev/null", {
          cwd,
          encoding: "utf-8",
          timeout: 1000,
        }).trim();
      }
      return branch;
    } catch {
      return "";
    }
  }

  function formatStatusLine(ctx: ExtensionContext): string {
    const dim = "\x1b[38;5;247m";
    const reset = "\x1b[0m";
    const sep = `${dim} · ${reset}`;

    // 1. Model name
    let modelName = ctx.model?.name || ctx.models.current()?.name || ctx.model?.id || "unknown";
    if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }
    const modelPart = `\x1b[38;5;208m✦ ${modelName}${reset}`;

    // 2. Effort / Thinking level
    let thinkingLevel = "";
    try {
      if (typeof pi.getThinkingLevel === "function") {
        thinkingLevel = pi.getThinkingLevel() || "";
      }
    } catch {}

    if (!thinkingLevel) {
      try {
        const ctxRecord = ctx as unknown as Record<string, unknown>;
        if (typeof ctxRecord.getThinkingLevel === "function") {
          const res = (ctxRecord.getThinkingLevel as () => unknown)();
          if (typeof res === "string") thinkingLevel = res;
        }
      } catch {}
    }

    if (!thinkingLevel && ctx.sessionManager?.getBranch) {
      try {
        const branch = ctx.sessionManager.getBranch();
        for (let i = branch.length - 1; i >= 0; i--) {
          const entry = branch[i] as unknown as Record<string, unknown>;
          if (entry && entry.type === "thinking_level_change" && typeof entry.thinkingLevel === "string") {
            thinkingLevel = entry.thinkingLevel;
            break;
          }
        }
      } catch {}
    }

    const effortPart =
      thinkingLevel && thinkingLevel !== "off"
        ? `\x1b[35m${thinkingLevel}${reset}`
        : "";
    // 3. Context window usage & progress bar
    const contextUsage = ctx.getContextUsage?.();
    const usedPct = contextUsage?.percent !== undefined ? Math.round(contextUsage.percent) : 0;
    const filled = Math.min(8, Math.max(0, Math.floor((usedPct * 8) / 100)));
    const bar = "━".repeat(filled) + "─".repeat(8 - filled);

    let ctxColor = "\x1b[38;5;247m";
    if (usedPct >= 75) {
      ctxColor = "\x1b[91m";
    } else if (usedPct >= 50) {
      ctxColor = "\x1b[93m";
    }
    const ctxPart = `${ctxColor}${bar} ${usedPct}%${reset}`;

    // 4. TPM / Throughput calculation
    let totalTokens = 0;
    try {
      const stats = ctx.sessionManager?.getUsageStatistics?.();
      if (stats) {
        totalTokens = (stats.input || 0) + (stats.output || 0) + (stats.cacheRead || 0);
      }
    } catch {}

    const durationMs = Math.max(1000, Date.now() - sessionStartTime);
    const tpm = durationMs > 0 ? Math.round((totalTokens * 60000) / durationMs) : 0;

    let tpmDisplay = "0";
    if (tpm >= 10000) {
      tpmDisplay = `${Math.floor(tpm / 1000)}k`;
    } else if (tpm >= 1000) {
      tpmDisplay = `${(tpm / 1000).toFixed(1)}k`;
    } else {
      tpmDisplay = `${tpm}`;
    }
    const tpmPart = `\x1b[93mϟ${reset} ${dim}${tpmDisplay} tpm${reset}`;

    // 5. Git branch (optional)
    const branch = getGitBranch(ctx.cwd);
    const branchPart = branch ? `\x1b[36m⌥ ${branch}${reset}` : "";

    // Assemble status line segments
    const parts = [modelPart];
    if (effortPart) parts.push(effortPart);
    parts.push(ctxPart);
    if (tpm > 0) parts.push(tpmPart);
    if (branchPart) parts.push(branchPart);

    return parts.join(sep);
  }

  function update(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    try {
      const line = formatStatusLine(ctx);
      ctx.ui.setWidget("claude-statusline", [line], { placement: "belowEditor" });
    } catch {}
  }

  pi.on("session_start", async (_event, ctx) => {
    sessionStartTime = Date.now();
    update(ctx);
    if (typeof ctx.setInterval === "function") {
      ctx.setInterval(() => update(ctx), 3000);
    }
  });
  pi.on("session_switch", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("session_branch", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("tool_result", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("context", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("input", async (_event, ctx) => {
    update(ctx);
  });

  pi.on("message_end", async (_event, ctx) => {
    update(ctx);
  });
}
