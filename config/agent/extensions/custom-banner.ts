import { VERSION, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// =============================================================================
// Shade-block banner — 2 rows, ~36 cols.
// =============================================================================

const BANNER_TINHTUTE = [
  "░░░▀█▀░█░█▄░█░█▄█░▀█▀░█▒█░▀█▀▒██▀░░",
  "▒░░▒█▒░█░█▒▀█▒█▒█░▒█▒░▀▄█░▒█▒░█▄▄▒░",
];
const BANNER_OMP = [
  "▗█▀▀█▛ ▄█████▙▖▗█▀▀█▌",
  "▐█  █▌ █▌ █▌ █▌▐█  █▌",
  "▐█  █▌ █▌ █▌ █▌▐█▀▀▀▀",
  "▝█▄▄█▙ ▀▙ ▜▌ ▜▌▝█▄▄",
];

// OMP Brand Gradient: Magenta (#F84FCC) -> Violet (#9362F4) -> Cyan (#00DBE4)
const GRADIENT_STOPS: [number, number, number][] = [
  [248, 79, 204],
  [147, 98, 244],
  [0, 219, 228],
];

interface CustomBannerMessage {
  customType?: string;
  details?: {
    variant?: string;
  };
}

function interpolateColor(ratio: number): string {
  const scaled = Math.max(0, Math.min(1, ratio)) * (GRADIENT_STOPS.length - 1);
  const idx = Math.min(GRADIENT_STOPS.length - 2, Math.floor(scaled));
  const u = scaled - idx;
  const c1 = GRADIENT_STOPS[idx];
  const c2 = GRADIENT_STOPS[idx + 1];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * u);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * u);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * u);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function center(text: string, width: number): string {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, Math.floor((width - plain.length) / 2));
  return " ".repeat(pad) + text;
}

function colorizeBanner(lines: string[]): string[] {
  const maxLen = Math.max(...lines.map(l => l.length));
  return lines.map(line => {
    let out = "";
    for (let i = 0; i < line.length; i++) {
      out += interpolateColor(i / Math.max(1, maxLen - 1)) + line[i];
    }
    return out + "\x1b[0m";
  });
}

function formatBannerLines(variant: "tinhtute" | "omp", width: number, expanded = false): string[] {
  // trimBlankEdges drops plain-blank rows at block edges; a bare ANSI reset
  // survives (non-\S) while rendering blank — keeps the gap above the art.
  const lines: string[] = ["\x1b[0m"];

  const art = variant === "omp" ? BANNER_OMP : BANNER_TINHTUTE;
  const artWidth = Math.max(...art.map(l => l.length));
  if (width >= artWidth) {
    for (const line of colorizeBanner(art)) {
      lines.push(center(line, width));
    }
  } else {
    lines.push(center("\x1b[1;38;5;208m◆ TINHTUTE ◆\x1b[0m", width));
  }

  lines.push("");

  const subtitle = `\x1b[1m\x1b[38;2;248;79;204mompz\x1b[0m \x1b[90mv${VERSION}\x1b[0m \x1b[90m·\x1b[0m \x1b[38;2;0;219;228mminimal coding agent\x1b[0m`;
  lines.push(center(subtitle, width));

  if (expanded) {
    lines.push("");
    lines.push(center("\x1b[1mKeyboard Shortcuts\x1b[0m", width));
    lines.push("");
    const shortcuts: [string, string][] = [
      ["Ctrl+C", "Interrupt / Clear"],
      ["Ctrl+D", "Exit (empty draft)"],
      ["Ctrl+O", "Toggle expand tools & details"],
      ["Shift+Tab", "Cycle thinking level"],
      ["Ctrl+P / Shift+Ctrl+P", "Cycle models forward / backward"],
      ["Alt+M", "Select model dialog"],
      ["Ctrl+G", "Open external editor"],
      ["/", "Slash commands menu"],
      ["!", "Run bash command in terminal"],
      ["Ctrl+Q / Ctrl+Enter", "Queue follow-up message"],
    ];
    for (const [key, desc] of shortcuts) {
      const item = `  \x1b[38;2;147;98;244m${key.padEnd(24)}\x1b[0m \x1b[90m${desc}\x1b[0m`;
      lines.push(width > 50 ? center(item, width) : item);
    }
  } else {
    const hints = "\x1b[90mCtrl+C interrupt · / commands · ! bash · Ctrl+O more\x1b[0m";
    lines.push(center(hints, width));
  }

  lines.push("");
  return lines;
}

class CustomBannerComponent {
  private variant: "tinhtute" | "omp";
  private expanded: boolean;

  constructor(variant: "tinhtute" | "omp" = "tinhtute", expanded = false) {
    this.variant = variant;
    this.expanded = expanded;
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  render(width: number): string[] {
    return formatBannerLines(this.variant, width, this.expanded);
  }
}

export default function customBannerExtension(pi: ExtensionAPI) {
  // Custom message renderer: renders cleanly without default message framing/box
  pi.registerMessageRenderer("custom-banner", (message: CustomBannerMessage, { expanded }: { expanded: boolean }) => {
    const variant = message.details?.variant === "omp" ? "omp" : "tinhtute";
    return new CustomBannerComponent(variant, expanded);
  });

  // Display banner on session start — TUI only.
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    pi.sendMessage(
      {
        customType: "custom-banner",
        content: "",
        display: true,
        attribution: "agent",
        details: { variant: "tinhtute" },
      },
      { triggerTurn: false }
    );
  });

  // Slash command: /banner [tinhtute|omp]
  pi.registerCommand("banner", {
    description: "Display custom banner (/banner, /banner omp)",
    getArgumentCompletions: prefix =>
      ["tinhtute", "omp"]
        .filter(variant => variant.startsWith(prefix.trim().toLowerCase()))
        .map(variant => ({ value: variant, label: variant })),
    handler: async (args, ctx) => {
      const mode = (args ?? "").trim().toLowerCase();
      const variant = mode.includes("omp") ? "omp" : "tinhtute";

      pi.sendMessage(
        {
          customType: "custom-banner",
          content: "",
          display: true,
          attribution: "agent",
          details: { variant },
        },
        { triggerTurn: false }
      );

      ctx.ui.notify(`Banner (${variant}) displayed`, "info");
    },
  });
}
