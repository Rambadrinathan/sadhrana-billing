/**
 * Teaches plain node the "@/..." alias that next.config/jsconfig give the app.
 *
 * Without it a test can only reach a lib file that imports nothing — which is
 * why the older tests copy the logic under test into the test file and note
 * "keep in sync". That comment is a bug waiting to happen: the copy silently
 * stops matching the code it claims to cover. This lets a test import the real
 * module instead.
 *
 * Usage:  node --import ./tests/register-alias.mjs --test tests/*.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL("./tests/"));
