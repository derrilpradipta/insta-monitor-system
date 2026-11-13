import "dotenv/config";
import { chromium } from "playwright";
async function main() {
  const ids = ["313568", "313598"];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Jakarta" });
  await ctx.addInitScript("globalThis.__name = function (fn) { return fn; };");
  const page = await ctx.newPage();
  await page.goto(process.env.SOURCE_LOGIN_URL!, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', process.env.SCRAPER_USERNAME!);
  await page.fill('input[name="password"]', process.env.SCRAPER_PASSWORD!);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null), page.click('button[type="submit"]')]);
  for (const id of ids) {
    await page.goto(`https://www.instasiaga.com/workflow_order/detail/${id}`, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => {
      const lines = (document.body.innerText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const dl = lines.filter((l) => /deadline/i.test(l));
      return { status: lines.find((l) => /^Status/.test(l)), deadlineLines: dl, hasDeadline: dl.length > 0 };
    });
    console.log(id, "->", JSON.stringify(r));
  }
  await browser.close();
}
main();
