# Joins the recorded walkthrough with the voice-over: each scene's narration starts exactly when the
# scene starts on screen. Output: docs/video/civicops-walkthrough.mp4 (H.264 + AAC, web-ready).
import json, subprocess, pathlib, sys
FF = r"D:\U-Scale-Promo\bin\ffmpeg.exe"
FFPROBE = r"D:\U-Scale-Promo\bin\ffprobe.exe"
raw = ".data/video/raw.webm"
timeline = json.load(open(".data/video/timeline.json"))
crf = sys.argv[1] if len(sys.argv) > 1 else "20"
out = pathlib.Path("docs/video"); out.mkdir(parents=True, exist_ok=True)
dest = out / "civicops-walkthrough.mp4"

dur = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw], capture_output=True, text=True).stdout.strip())
args = [FF, "-y", "-i", raw]
filters, labels = [], []
for i, s in enumerate(timeline, start=1):
    args += ["-i", f".data/video/audio/{s['id']}.mp3"]
    ms = max(0, int(s["startMs"]) + 350)  # a beat after the cut, so the picture lands first
    filters.append(f"[{i}:a]adelay={ms}|{ms},apad=whole_dur={dur:.2f}[a{i}]")
    labels.append(f"[a{i}]")
filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{dur:.2f}[aout]")
fade_out = max(0, dur - 1.2)
filters.append(f"[0:v]fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st={fade_out:.2f}:d=1.2[vout]")
args += ["-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-tune", "stillimage", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(dest)]
subprocess.run(args, check=True, capture_output=True)
size = dest.stat().st_size / 1e6
print(f"{dest} {size:.1f} MB, {dur/60:.2f} min")
