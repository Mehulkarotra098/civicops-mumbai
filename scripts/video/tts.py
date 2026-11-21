# Voice-over for the walkthrough: one MP3 per scene (Microsoft neural voice, Indian English).
import asyncio, json, subprocess, re, sys, pathlib
import edge_tts
FFPROBE = r"D:\U-Scale-Promo\bin\ffprobe.exe"
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-IN-NeerjaNeural"
out = pathlib.Path(".data/video/audio"); out.mkdir(parents=True, exist_ok=True)
scenes = json.load(open("scripts/video/narration.json", encoding="utf-8"))
async def one(s):
    f = out / f"{s['id']}.mp3"
    for attempt in range(6):
        try:
            await edge_tts.Communicate(s["text"], VOICE).save(str(f))
            if f.stat().st_size > 2000:
                return f
        except Exception as e:
            print("retry", s["id"], attempt + 1, type(e).__name__, flush=True)
        await asyncio.sleep(2 + attempt * 2)
    raise SystemExit(f"voice failed for {s['id']}")
async def main():
    durs = {}
    for s in scenes:
        f = await one(s)
        d = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout.strip())
        durs[s["id"]] = round(d, 2)
        print(s["id"], durs[s["id"]], flush=True)
    json.dump(durs, open(out / "durations.json", "w"), indent=1)
    print("TOTAL", round(sum(durs.values()) / 60, 2), "min")
asyncio.run(main())
