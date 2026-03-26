// ── History ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
  pastedContents: Record<string, unknown>;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface SessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  lastSeenAt?: number; // Most recent activity timestamp (from history)
  kind: "interactive" | "headless";
}

export interface ActiveSession extends SessionFile {
  isAlive: boolean;
  projectName: string;
  encodedProjectDir: string; // Matched ~/.claude/projects/<dir> name (may differ from encodeProjectPath(cwd))
  duration: number;
  messageCount: number;
  totalTokens: TokenUsage;
  model: string;
  agentCount: number;
}

// ── Conversations ────────────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ConversationEntry {
  type: "user" | "assistant" | "progress" | "file-history-snapshot";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  isSidechain: boolean;
  userType?: string;
  message?: {
    role: string;
    model?: string;
    content: unknown;
    usage?: TokenUsage;
  };
  data?: unknown;
  slug?: string;
  permissionMode?: string;
  version?: string;
  gitBranch?: string;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface AgentMeta {
  agentType: string;
  description: string;
}

export interface AgentInfo extends AgentMeta {
  agentId: string;
  sessionId: string;
  messageCount: number;
  totalTokens: TokenUsage;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface ClaudeSettings {
  model?: string;
  enabledPlugins?: Record<string, boolean>;
  autoUpdatesChannel?: string;
}

// ── Plugins ──────────────────────────────────────────────────────────────────

export interface InstalledPlugin {
  name: string;
  scope: string;
  version: string;
  installPath: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
}

// ── MCP Auth ─────────────────────────────────────────────────────────────────

export interface McpAuthEntry {
  name: string;
  timestamp: number;
}

// ── Project Activity ─────────────────────────────────────────────────────────

export interface ProjectStats {
  encodedPath: string;
  decodedPath: string;
  projectName: string;
  sessionCount: number;
  totalTokens: TokenUsage;
}

// ── Token Time Series ────────────────────────────────────────────────────────

export interface TokenBucket {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

// ── System Resources ─────────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  cpu: number;
  memory: number;
  rss: number;
}

export interface SystemStats {
  claudeProcesses: ProcessInfo[];
  totalCpu: number;
  totalMemory: number;
  totalRss: number;
  osTotalMem: number;
  osUsedMem: number;
  osMemPercent: number;
  osCpuPercent: number;
  processRss: number;
  processHeap: number;
  cpuCoreCount: number;
}

// ── Cost Estimation ──────────────────────────────────────────────────────────

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheCreationPerMillion: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheCreationCost: number;
  total: number;
}
