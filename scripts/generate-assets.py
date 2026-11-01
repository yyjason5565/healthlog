#!/usr/bin/env python3
"""Generate HealthLog icons and a fictional lab-report fixture. No real patient data."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
FIXTURE = ROOT / "tests" / "fixtures" / "lab-report.png"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), "#0f6e6b")
    draw = ImageDraw.Draw(img)
    margin = size * 0.16
    draw.ellipse((margin, margin, size - margin, size - margin), fill="#167e7a")
    mid = size * 0.54
    points = [
        (size * 0.24, mid),
        (size * 0.36, mid),
        (size * 0.44, mid - size * 0.11),
        (size * 0.52, mid + size * 0.15),
        (size * 0.61, mid - size * 0.07),
        (size * 0.68, mid),
        (size * 0.78, mid),
    ]
    width = max(4, round(size / 16))
    draw.line(points, fill="white", width=width, joint="curve")
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="white")
    return img


def write_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    for size, name in (
        (180, "icon-180.png"),
        (180, "apple-touch-icon.png"),
        (192, "icon-192.png"),
        (512, "icon-512.png"),
    ):
        draw_icon(size).save(ICONS / name, "PNG", optimize=True)


def report_line(name, result, unit, ref, flag=""):
    return f"{name:<20}{result:>7}  {unit:<8}  {ref:<14}{flag}"


def write_lab_report() -> None:
    rows = [
        report_line("Haemoglobin", "138", "g/L", "130 - 170"),
        report_line("White Cell Count", "7.2", "x10^9/L", "4.0 - 11.0"),
        report_line("Platelet Count", "250", "x10^9/L", "150 - 400"),
        report_line("HbA1c", "6.2", "%", "< 5.7", "H"),
        report_line("Fasting Glucose", "5.4", "mmol/L", "4.0 - 5.6"),
        report_line("Total Cholesterol", "6.1", "mmol/L", "< 5.2", "H"),
        report_line("HDL Cholesterol", "1.1", "mmol/L", "> 1.0"),
        report_line("LDL Cholesterol", "3.8", "mmol/L", "< 3.4", "H"),
        report_line("Triglycerides", "1.9", "mmol/L", "< 1.7", "H"),
        report_line("Creatinine", "78", "umol/L", "60 - 110"),
        report_line("ALT", "32", "U/L", "< 41"),
        report_line("TSH", "2.40", "mIU/L", "0.40 - 4.00"),
    ]
    width, height = 1800, 1180
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, width, 168), fill="#0f6e6b")
    title = ImageFont.truetype(SANS_BOLD, 48)
    sub = ImageFont.truetype(SANS, 28)
    body = ImageFont.truetype(MONO, 34)
    small = ImageFont.truetype(SANS, 26)
    draw.text((56, 36), "NORTHSHORE SAMPLE LABORATORY", font=title, fill="white")
    draw.text((56, 100), "FICTIONAL REPORT — NOT A REAL PATIENT", font=sub, fill="#e7f6f4")
    draw.text((56, 188), "Laboratory: Northshore Sample Laboratory", font=small, fill="#14211f")
    draw.text((56, 228), "Patient: Demo Person          Collected: 12 Mar 2026", font=small, fill="#243330")
    draw.text((56, 268), "Doctor: Dr Example           Reported: 13 Mar 2026", font=small, fill="#243330")
    header = report_line("Test", "Result", "Unit", "Reference", "Flag")
    draw.text((48, 324), header, font=body, fill="#5c6f6c")
    draw.line((48, 372, width - 48, 372), fill="#c9d7d3", width=2)
    y = 390
    for i, row in enumerate(rows):
        if i % 2 == 0:
            draw.rectangle((36, y - 8, width - 36, y + 46), fill="#f4f8f7")
        draw.text((48, y), row, font=body, fill="#14211f")
        y += 58
    draw.text(
        (56, height - 70),
        "Invented numbers for software testing only. Not a medical record.",
        font=small,
        fill="#5c6f6c",
    )
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    img.save(FIXTURE, "PNG", optimize=True, dpi=(120, 120))


if __name__ == "__main__":
    write_icons()
    write_lab_report()
    print("wrote icons and", FIXTURE)
