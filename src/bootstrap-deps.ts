import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function hasPackage(name: string): boolean {
  try {
    require.resolve(name, { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

const requiredPackages = ["hono", "@hono/node-server", "jose", "@snazzah/davey"];
const missingPackages = requiredPackages.filter((name) => !hasPackage(name));

if (missingPackages.length) {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Missing npm packages (${missingPackages.join(", ")}). Deploy package.json to ${root} and run: npm install --omit=dev`
    );
  }

  console.log(`[bot-control] Missing packages: ${missingPackages.join(", ")}. Running npm install...`);
  const result = spawnSync("npm", ["install", "--omit=dev"], {
    cwd: root,
    stdio: "inherit",
    shell: true
  });

  if (result.status !== 0) {
    throw new Error("npm install failed. Run manually in the app directory: npm install --omit=dev");
  }

  for (const name of missingPackages) {
    if (!hasPackage(name)) {
      throw new Error(`Package "${name}" is still missing after npm install.`);
    }
  }
}
