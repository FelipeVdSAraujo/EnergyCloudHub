import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultRoot = path.resolve(__dirname, "..", "..", "..");
const repoRoot = process.env.ENSOLVE_ROOT || process.env.REPO_ROOT || defaultRoot;

const resolveRepoPath = (...segments) => path.join(repoRoot, ...segments);

export { repoRoot, resolveRepoPath };
