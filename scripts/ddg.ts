import { ddgSearch } from "../src/lib/discovery";

const query = process.argv[2] || 'site:docs.github.com "create an OAuth app"';
const results = await ddgSearch(query, 10);
console.log(`results=${results.length}`);
for (const r of results) console.log(`${r.title}\n  ${r.url}\n  ${r.snippet.slice(0, 120)}`);
