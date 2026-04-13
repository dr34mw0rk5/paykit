import picocolors from "picocolors";

import { getDependencies } from "./get-dependencies";

export async function checkDependencies(
  dependencies: string[],
  targetVersionDependency: string,
): Promise<void> {
  const { resolved } = await getDependencies(process.cwd(), dependencies);

  const versionMap = new Map<string, string[]>();

  for (const [pkg, { version }] of resolved) {
    const existing = versionMap.get(version);
    if (existing) {
      existing.push(pkg);
    } else {
      versionMap.set(version, [pkg]);
    }
  }

  if (versionMap.size <= 1) return;

  const targetVersion = resolved.get(targetVersionDependency)?.version;

  const mismatched = [...versionMap.entries()].filter(([version]) => version !== targetVersion);

  const lines = mismatched.flatMap(([version, pkgs]) =>
    pkgs.map((pkg) =>
      targetVersion ? `  ${pkg}@${version} (expected ${targetVersion})` : `  ${pkg}@${version}`,
    ),
  );

  const fixPkgs = mismatched
    .flatMap(([_, pkgs]) => pkgs.map((pkg) => (targetVersion ? `${pkg}@${targetVersion}` : pkg)))
    .join(" ");

  console.warn(
    `${picocolors.red("[paykit]")} Mismatching dependency versions:\n` +
      `${lines.join("\n")}\n` +
      `  Run ${picocolors.bold(`pnpm install ${fixPkgs}`)} to fix.`,
  );
}
