# Builds docs/pitch/CivicOps-Mumbai-pitch.pptx: one full-bleed slide image per slide, talk track in the notes.
import json, pathlib
from pptx import Presentation
from pptx.util import Emu
d = pathlib.Path("docs/pitch")
notes = json.load(open(d / "slides" / "notes.json", encoding="utf-8"))
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9
blank = prs.slide_layouts[6]
for i, img in enumerate(sorted((d / "slides").glob("slide-*.png"))):
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(str(img), 0, 0, width=prs.slide_width, height=prs.slide_height)
    s.notes_slide.notes_text_frame.text = notes[i] if i < len(notes) else ""
prs.save(d / "CivicOps-Mumbai-pitch.pptx")
print("pptx", len(prs.slides), "slides")
