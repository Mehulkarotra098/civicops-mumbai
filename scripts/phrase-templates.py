# Turns collected page phrases into translation keys: data tokens (amounts, numbers, dates, IDs, ward codes)
# become {0},{1}..; keeps only phrases whose wording comes from the app's own source code.
import json, re, sys, pathlib
TOK = re.compile(r"(\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}(?:, \d{1,2}:\d{2} (?:AM|PM) IST)?|\d{1,2}:\d{2}(?::\d{2})? ?(?:am|pm|AM|PM)?(?: IST)?|₹[\d,]+(?:\.\d+)?(?: ?(?:Cr|L))?|\b(?:CO|WO|BMC|CT|RD|WP)[-A-Z0-9]*\d[-A-Z0-9]*\b|\b[A-Z](?:/[A-Z])\b|\d[\d,]*(?:\.\d+)?)")
def key(t):
    i = [0]
    def r(m):
        k = '{%d}' % i[0]; i[0] += 1; return k
    return TOK.sub(r, t)
src = ''
for p in pathlib.Path('src').rglob('*'):
    if p.suffix in ('.ts', '.tsx') and 'i18n' not in p.parts:
        src += p.read_text(encoding='utf-8', errors='ignore')
src_norm = re.sub(r'\s+', ' ', src)
data = json.load(open(sys.argv[1], encoding='utf-8'))
keys = {}
for d in data:
    k = key(d['text'])
    segs = [s.strip(' .,:;·()–-') for s in re.split(r'\{\d+\}', k)]
    segs = [s for s in segs if len(s) >= 2 and re.search('[A-Za-z]', s)]
    if not segs: continue
    if all(s in src_norm for s in segs):
        keys.setdefault(k, {'n': 0, 'example': d['text']})
        keys[k]['n'] += d['n']
out = [{'key': k, 'example': v['example']} for k, v in sorted(keys.items(), key=lambda kv: -kv[1]['n'])]
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'keys,', sum(len(x['key']) for x in out), 'chars')
