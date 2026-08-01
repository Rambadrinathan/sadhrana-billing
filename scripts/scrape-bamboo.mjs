import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "tmp-bamboo-house");
fs.mkdirSync(outDir, { recursive: true });

const pageRes = await fetch("https://www.sadhranabagh.com/bamboo-house");
const html = await pageRes.text();
fs.writeFileSync(path.join(outDir, "page.html"), html);

const set = new Set();
const re = /static\.wixstatic\.com\/media\/([a-zA-Z0-9_~]+\.(jpe?g|png|webp))/gi;
let m;
while ((m = re.exec(html))) {
  set.add(`https://static.wixstatic.com/media/${m[1]}`);
}

const skip =
  /icon-|news-thumbnail|villa-kerala|villa-library|villa-beri|swimpool|wifi|ups|bt-speaker|aircon|blanket|kitchen\.png|yoga|massage|board-game|drink|bbq|walk|swim/i;

const urls = [...set].filter((u) => !skip.test(u));
console.log("unique media urls", urls.length);
urls.forEach((u) => console.log(u));
fs.writeFileSync(path.join(outDir, "urls.json"), JSON.stringify(urls, null, 2));

let i = 0;
for (const url of urls) {
  i += 1;
  const ext = (url.match(/\.(jpe?g|png|webp)/i) || [, "jpg"])[1];
  const file = path.join(outDir, `bamboo-${String(i).padStart(2, "0")}.${ext}`);
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.log("fail", r.status, url);
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(file, buf);
    console.log("saved", file, buf.length);
  } catch (e) {
    console.log("err", e.message, url);
  }
}
console.log("done", outDir);
