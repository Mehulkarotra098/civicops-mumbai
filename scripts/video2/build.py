# Joins the recorded story with Andrew's voice-over: each clip starts 0.3 s after its scene starts on screen.
# Output: docs/video/civicops-5min-story.mp4 (1080p H.264 + AAC stereo) and a copy in D:/hackathon.
import json, subprocess, pathlib, shutil
FF = r"D:\U-Scale-Promo\bin\ffmpeg.exe"
FFPROBE = r"D:\U-Scale-Promo\bin\ffprobe.exe"
V = ".data/video2/"
raw = V + "raw.webm"
timeline = json.load(open(V + "timeline.json"))
dest = pathlib.Path("docs/video/civicops-5min-story.mp4"); dest.parent.mkdir(parents=True, exist_ok=True)
dur = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw], capture_output=True, text=True).stdout.strip())
args = [FF, "-y", "-i", raw]
f, labels = [], []
for i, s in enumerate(timeline, start=1):
    args += ["-i", f"{V}audio/{s['id']}.mp3"]
    ms = max(0, int(s.get("voiceMs", s["startMs"] + 300)))
    f.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms},apad=whole_dur={dur:.2f}[a{i}]")
    labels.append(f"[a{i}]")
f.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{dur:.2f},afade=t=out:st={dur - 1.0:.2f}:d=1.0[aout]")
f.append(f"[0:v]fps=30,scale=1920:1080:flags=lanczos,unsharp=3:3:0.35,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st={dur - 1.0:.2f}:d=1.0[vout]")
args += ["-filter_complex", ";".join(f), "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-tune", "stillimage", "-profile:v", "high", "-level", "4.1",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-t", f"{dur:.2f}", str(dest)]
subprocess.run(args, check=True, capture_output=True)
shutil.copyfile(dest, "D:/hackathon/CivicOps-5min-story.mp4")
print(f"{dest} {dest.stat().st_size / 1e6:.1f} MB, {dur / 60:.2f} min")
