# Voice-over at one steady pace: every clip is generated, measured, and regenerated with a rate that brings it to TARGET words/second.
import asyncio, json, subprocess, pathlib, sys
import edge_tts
FFPROBE = r"D:\U-Scale-Promo\bin\ffprobe.exe"
VOICE, TARGET = "en-US-AndrewMultilingualNeural", 2.5
out = pathlib.Path(".data/video2/audio"); out.mkdir(parents=True, exist_ok=True)
scenes = json.load(open("scripts/video2/narration.json", encoding="utf-8"))
dur = lambda f: float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout.strip())
async def say(text, rate, f):
    for attempt in range(8):
        try:
            await edge_tts.Communicate(text, VOICE, rate=rate).save(str(f))
            if f.stat().st_size > 2000: return
        except Exception as e:
            print("retry", f.stem, attempt + 1, type(e).__name__, flush=True)
        await asyncio.sleep(2 + attempt * 2)
    raise SystemExit("voice failed " + f.stem)
async def main():
    durs, rates = {}, {}
    for s in scenes:
        f = out / f"{s['id']}.mp3"; n = len(s["text"].split())
        await say(s["text"], "+0%", f)
        r = round((n / dur(f) / TARGET - 1) * -100) * -1  # percent change needed
        pct = max(-25, min(25, round((TARGET * dur(f) / n - 1) * 100)))
        rate = f"{pct:+d}%"
        if pct != 0: await say(s["text"], rate, f)
        durs[s["id"]] = round(dur(f), 2); rates[s["id"]] = rate
        print(f"{s['id']:9s} {durs[s['id']]:5.1f}s rate {rate:>5s} -> {n / durs[s['id']]:.2f} words/s", flush=True)
    json.dump(durs, open(out / "durations.json", "w"), indent=1)
    print("TOTAL", round(sum(durs.values()) / 60, 2), "min")
asyncio.run(main())
