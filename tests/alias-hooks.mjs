import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();

/**
 * Map "@/lib/x" onto the file it means, and let node resolve the rest.
 *
 * The app's imports are extensionless because the bundler fills that in, so the
 * ".js" has to be added here or node reports the module as missing.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let target = path.join(ROOT, specifier.slice(2));
    if (!path.extname(target)) target += ".js";
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
