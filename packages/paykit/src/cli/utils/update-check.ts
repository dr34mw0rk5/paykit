import picocolors from "picocolors";

import { version as currentVersion } from "../../version";

const UPDATE_CHECK_TIMEOUT_MS = 3000;

function isNewer(latest: string, current: string): boolean {
  const [latestMain, ...latestPreParts] = latest.split("-");
  const [currentMain, ...currentPreParts] = current.split("-");
  const latestPre = latestPreParts.join("-");
  const currentPre = currentPreParts.join("-");

  const latestParts = latestMain!.split(".").map(Number);
  const currentParts = currentMain!.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if ((latestParts[i] ?? 0) > (currentParts[i] ?? 0)) return true;
    if ((latestParts[i] ?? 0) < (currentParts[i] ?? 0)) return false;
  }

  // Same main version: stable is newer than any pre-release
  if (currentPre && !latestPre) return true;
  if (!currentPre) return false;

  // Both pre-release: compare identifiers
  const latestIds = latestPre.split(".");
  const currentIds = currentPre.split(".");

  for (let i = 0; i < Math.max(latestIds.length, currentIds.length); i++) {
    if (i >= currentIds.length) return true;
    if (i >= latestIds.length) return false;

    const lNum = Number(latestIds[i]);
    const cNum = Number(currentIds[i]);

    if (!Number.isNaN(lNum) && !Number.isNaN(cNum)) {
      if (lNum > cNum) return true;
      if (lNum < cNum) return false;
    } else {
      if (latestIds[i]! > currentIds[i]!) return true;
      if (latestIds[i]! < currentIds[i]!) return false;
    }
  }

  return false;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await Promise.race([
      fetch("https://registry.npmjs.org/paykitjs/latest"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), UPDATE_CHECK_TIMEOUT_MS),
      ),
    ]);
    const data = (await response.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

export function startUpdateCheck(): Promise<string | null> {
  return fetchLatestVersion();
}

export async function printUpdateNotification(
  updateCheckPromise: Promise<string | null>,
  installCommand: string,
): Promise<void> {
  const latest = await updateCheckPromise;
  if (!latest) return;

  if (!isNewer(latest, currentVersion)) return;

  console.log(
    `   New version available: ${picocolors.yellow(currentVersion)} → ${picocolors.yellow(latest)}\n` +
      `   To update: ${picocolors.bold(installCommand)}`,
  );
}
