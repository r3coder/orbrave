// Downloads the CC0 source recordings used by build_bank.py (dev only, not part of the site).
//   node tools/samples/download.mjs <download dir>
//   tools/analyze/.venv/Scripts/python -I tools/samples/build_bank.py <download dir> public/samples
// Sources and licenses: public/samples/SOURCES.md
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const out = process.argv[2];
if (!out) throw new Error('usage: node download.mjs <download dir>');
const tree = async (repo, branch) => {
  const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers: { 'User-Agent': 'sample-download' } });
  return (await r.json()).tree;
};
const jobs = [];
const mck = await tree('MckAudio/MckSamplePacks', 'main');
for (const x of mck) if (x.type === 'blob' && /^(TR8|RD6)\/.*\.wav$/i.test(x.path))
  jobs.push([`https://raw.githubusercontent.com/MckAudio/MckSamplePacks/main/${x.path}`, join(out, 'mck', x.path)]);
const rusty = await tree('sfzinstruments/karoryfer.big-rusty-drums', 'master');
const want = [
  /^Samples\/kick_24\/kick\/(kick|oh)\/k_vl(10|12|13|14)_rr[1-4]\.flac$/,
  /^Samples\/snare_14\/center\/(top|oh)\/sn_center_vl(6|8|9|10)_rr[1-4]\.flac$/,
  /^Samples\/snare_14\/rimshot\/(top|oh)\/[^/]*vl\d+_rr[12]\.flac$/,
  /^Samples\/snare_14\/sidestick\/(top|oh)\/[^/]*_rr[12]\.flac$/,
  /^Samples\/hihat_14\/tc\/(cl|oh)\/ht_tc_vl(5|6|7|8)_rr[1-4]\.flac$/,
  /^Samples\/hihat_14\/open\/(cl|oh)\/[^/]*vl(4|5|6)_rr[12]\.flac$/,
  /^Samples\/hihat_14\/qo\/(cl|oh)\/[^/]*_rr1\.flac$/,
  /^Samples\/tom_(15|18)\/center\/(cl|oh)\/[^/]*_rr[12]\.flac$/,
  /^Samples\/ride_22\/rd\/(cl|oh)\/[^/]*_rr1\.flac$/,
  /^Samples\/ride_22\/bl\/(cl|oh)\/[^/]*_rr1\.flac$/,
  /^Samples\/crash_17\/cr\/(cl|oh)\/[^/]*_rr1\.flac$/,
];
for (const x of rusty) if (x.type === 'blob' && want.some((w) => w.test(x.path)))
  jobs.push([`https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/master/${x.path}`, join(out, 'rusty', x.path)]);
console.log('jobs', jobs.length);
let done = 0, fail = 0;
async function worker() {
  while (jobs.length) {
    const [url, file] = jobs.shift();
    if (existsSync(file)) { done++; continue; }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      done++;
    } catch (e) { fail++; console.log('FAIL', url, e.message); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
console.log('done', done, 'fail', fail);
