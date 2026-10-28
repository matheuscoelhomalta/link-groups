import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SYNC_SERVER } from "./sync-server";
import type { LinkDB } from "./types";

export type SyncConfig = { sshHost?: string; tailscalePath?: string };
export type SyncState = { version: 1; revision: number; db: LinkDB };

export async function readSyncConfig(
  supportPath: string,
): Promise<SyncConfig | null> {
  let raw: string;
  try {
    raw = await readFile(join(supportPath, "sync-config.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const config = JSON.parse(raw) as SyncConfig;
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    (config.sshHost !== undefined &&
      (typeof config.sshHost !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9@._-]*$/.test(config.sshHost))) ||
    (config.tailscalePath !== undefined &&
      (typeof config.tailscalePath !== "string" ||
        !config.tailscalePath.startsWith("/")))
  )
    throw new Error("Invalid Link Groups sync configuration.");
  return config;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function requestSync(
  config: SyncConfig,
  request:
    | { action: "read" }
    | { action: "join"; db: LinkDB }
    | { action: "write"; revision: number; db: LinkDB },
): Promise<SyncState | { conflict: true }> {
  const command = config.sshHost ? "/usr/bin/ssh" : "/usr/bin/python3";
  const args = config.sshHost
    ? [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        "-o",
        "ServerAliveInterval=3",
        "-o",
        "ServerAliveCountMax=1",
        "-o",
        `ProxyCommand=${shellQuote(config.tailscalePath ?? "/usr/local/bin/tailscale")} nc %h %p`,
        config.sshHost,
        `/usr/bin/python3 -c ${shellQuote(SYNC_SERVER)}`,
      ]
    : ["-c", SYNC_SERVER];
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { timeout: 12000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Unable to sync groups. ${stderr.trim().slice(0, 200) || "Check the connection to your sync Mac."}`,
            ),
          );
          return;
        }
        try {
          const response = JSON.parse(stdout) as SyncState | { conflict: true };
          if (
            !("conflict" in response) &&
            (response.version !== 1 ||
              !Number.isInteger(response.revision) ||
              !response.db)
          ) {
            throw new Error("Invalid response from the sync Mac.");
          }
          resolve(response);
        } catch (error) {
          reject(error);
        }
      },
    );
    child.stdin?.on("error", () => {
      /* execFile reports a closed transport. */
    });
    child.stdin?.end(JSON.stringify(request));
  });
}
