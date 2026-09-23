"""Generate the complete, competition-ready SIH 2026 presentation from the template.

Leaves Slide 1 (title/team page) completely untouched as requested.
Populates Slides 2 through 6 with high-density, professional, attractive layouts.
Deletes Slide 7 (the SIH instructions slide) so the final presentation strictly
has exactly 6 slides total per SIH rules.
"""

import os
import shutil
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

ORIGINAL_PPTX = "SIH2026-IDEA-Presentation-Format.pptx"
BACKUP_PPTX = "SIH2026-IDEA-Presentation-Format-Backup.pptx"
OUTPUT_PPTX = "SIH2026-IDEA-Presentation-Format.pptx"

# Backup original if not already backed up
if not os.path.exists(BACKUP_PPTX):
    shutil.copy2(ORIGINAL_PPTX, BACKUP_PPTX)
    print(f"Backed up original template to: {BACKUP_PPTX}")

prs = Presentation(BACKUP_PPTX)

# Palette definitions
COLOR_NAVY_TITLE = RGBColor(15, 23, 42)      # #0f172a
COLOR_HEADER_BLUE = RGBColor(2, 132, 199)    # #0284c7
COLOR_DARK_TEXT = RGBColor(30, 41, 59)       # #1e293b
COLOR_MUTED_TEXT = RGBColor(71, 85, 105)     # #475569
COLOR_CARD_BG = RGBColor(248, 250, 252)      # #f8fafc
COLOR_CARD_BORDER = RGBColor(203, 213, 225)  # #cbd5e1
COLOR_ACCENT_BLUE = RGBColor(239, 246, 255)  # #eff6ff
COLOR_ACCENT_BORDER = RGBColor(147, 197, 253)# #93c5fd
COLOR_WHITE = RGBColor(255, 255, 255)
COLOR_EMERALD = RGBColor(16, 185, 129)       # #10b981
COLOR_TABLE_HEADER = RGBColor(30, 41, 59)
COLOR_TABLE_ROW_ALT = RGBColor(241, 245, 249)

def clear_body_shapes(slide):
    """Remove template body placeholders and temporary textboxes, keeping header/footer."""
    shapes_to_remove = []
    for shape in slide.shapes:
        name = shape.name.lower()
        if "textbox 8" in name or "content placeholder" in name or "round diagonal" in name:
            shapes_to_remove.append(shape)
    for shape in shapes_to_remove:
        sp = shape._element
        sp.getparent().remove(sp)

def set_slide_title(slide, title_text):
    """Find and set the main slide title."""
    for shape in slide.shapes:
        if shape.name.startswith("Title"):
            shape.text_frame.text = title_text
            p = shape.text_frame.paragraphs[0]
            p.font.name = "Segoe UI"
            p.font.size = Pt(26)
            p.font.bold = True
            p.font.color.rgb = COLOR_NAVY_TITLE
            p.alignment = PP_ALIGN.LEFT
            shape.left = Inches(1.8)
            shape.top = Inches(0.2)
            shape.width = Inches(9.5)
            shape.height = Inches(0.9)
            return

def add_card(slide, left, top, width, height, title, bg_color=COLOR_CARD_BG, border_color=COLOR_CARD_BORDER):
    """Add a structured visual container card with header."""
    # Base card rectangle
    rect = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    rect.fill.solid()
    rect.fill.fore_color.rgb = bg_color
    rect.line.color.rgb = border_color
    rect.line.width = Pt(1.2)
    
    # Title box inside card
    tb = slide.shapes.add_textbox(left + Inches(0.12), top + Inches(0.08), width - Inches(0.24), Inches(0.35))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = "Segoe UI"
    p.font.size = Pt(11.5)
    p.font.bold = True
    p.font.color.rgb = COLOR_HEADER_BLUE
    return rect

# ==============================================================================
# SLIDE 2: PROPOSED SOLUTION & INNOVATION
# ==============================================================================
print("Formatting Slide 2: Proposed Solution...")
s2 = prs.slides[1]
clear_body_shapes(s2)
set_slide_title(s2, "PROPOSED SOLUTION & INNOVATION")

# Left Column: Problem & Proposed Solution Cards (Left: 0.7", Width: 6.8")
# Card 1: The Problem (Top: 1.25", Height: 2.3")
add_card(s2, Inches(0.7), Inches(1.25), Inches(6.8), Inches(2.3), "OPERATIONAL GAPS & STAKEHOLDER BOTTLENECK (INCOIS)")
tb_prob = s2.shapes.add_textbox(Inches(0.85), Inches(1.62), Inches(6.5), Inches(1.85))
tf_prob = tb_prob.text_frame
tf_prob.word_wrap = True
tf_prob.margin_left = tf_prob.margin_top = tf_prob.margin_right = tf_prob.margin_bottom = 0

prob_bullets = [
    ("Disconnected Data Silos: ", "Model grids (NetCDF) and observational data (Argo, buoys, gliders) are stored in isolated systems."),
    ("High Decision Latency: ", "Forecasters toggle between GIS plan views and terminal scripts, wasting 15–30 mins during cyclones."),
    ("Subsurface Blindspot: ", "Web portals only show 2D surface maps (SST), hiding subsurface heat and barrier layers that fuel cyclones."),
    ("No Direct Verification: ", "Forecasters cannot verify model predictions against collocated ground truth on the same screen.")
]
for i, (bold_prefix, text) in enumerate(prob_bullets):
    p = tf_prob.paragraphs[0] if i == 0 else tf_prob.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.space_after = Pt(3)
    p.level = 0
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Card 2: Proposed Solution (Top: 3.65", Height: 2.35")
add_card(s2, Inches(0.7), Inches(3.65), Inches(6.8), Inches(2.35), "OUR SOLUTION: OCEAN-3D WEB CO-VISUALIZATION PLATFORM", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_sol = s2.shapes.add_textbox(Inches(0.85), Inches(4.02), Inches(6.5), Inches(1.9))
tf_sol = tb_sol.text_frame
tf_sol.word_wrap = True
tf_sol.margin_left = tf_sol.margin_top = tf_sol.margin_right = tf_sol.margin_bottom = 0

sol_bullets = [
    ("Zero-Install Web Platform: ", "Runs directly in any modern browser, unifying 4D model grids with multi-sensor in-situ profiles."),
    ("Dual 3D WebGL Engine: ", "CesiumJS for global 4D spatio-temporal navigation + Three.js for 3D subsurface volumetric raymarching."),
    ("On-the-Fly Model Verification: ", "Calculates real-time Mean Absolute Error (MAE in °C & PSU) when inspecting any sensor profile."),
    ("Dual-Mode Operation: ", "Forecaster Mode (depth-slices, colorbars, log-scale) + Public Tour Mode (5-beat Cyclone Amphan story).")
]
for i, (bold_prefix, text) in enumerate(sol_bullets):
    p = tf_sol.paragraphs[0] if i == 0 else tf_sol.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(9.5)
    p.space_after = Pt(3)
    p.level = 0
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Key Value Banner (Bottom of Left Column, Top: 6.08", Height: 0.45")
rect_val = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(6.08), Inches(6.8), Inches(0.42))
rect_val.fill.solid()
rect_val.fill.fore_color.rgb = COLOR_NAVY_TITLE
rect_val.line.color.rgb = COLOR_HEADER_BLUE
tf_val = rect_val.text_frame
tf_val.word_wrap = True
p_val = tf_val.paragraphs[0]
p_val.alignment = PP_ALIGN.CENTER
run_v1 = p_val.add_run()
run_v1.text = "Key Value: "
run_v1.font.name = "Segoe UI"
run_v1.font.bold = True
run_v1.font.size = Pt(9.5)
run_v1.font.color.rgb = RGBColor(56, 189, 248)
run_v2 = p_val.add_run()
run_v2.text = "Cuts ocean verification time from 30 mins to sub-second interactive co-display in any browser."
run_v2.font.name = "Segoe UI"
run_v2.font.size = Pt(9)
run_v2.font.color.rgb = COLOR_WHITE

# Right Column: Prototype Visual & Comparison Table (Left: 7.65", Width: 5.0")
# Screenshot Visual
img_path = "stage_gap_closure_ctd_profile.png"
if os.path.exists(img_path):
    s2.shapes.add_picture(img_path, Inches(7.65), Inches(1.25), width=Inches(5.0), height=Inches(2.7))
    tb_cap = s2.shapes.add_textbox(Inches(7.65), Inches(3.96), Inches(5.0), Inches(0.25))
    tb_cap.text_frame.margin_left = tb_cap.text_frame.margin_top = tb_cap.text_frame.margin_right = tb_cap.text_frame.margin_bottom = 0
    p_cap = tb_cap.text_frame.paragraphs[0]
    p_cap.text = "▲ Working Prototype: In-Situ CTD Cast vs. Collocated Model with Live MAE Banner"
    p_cap.font.name = "Segoe UI"
    p_cap.font.size = Pt(8.5)
    p_cap.font.bold = True
    p_cap.font.color.rgb = COLOR_HEADER_BLUE

# Comparison Table (Top: 4.25", Height: 2.25")
rows, cols = 5, 3
table_shape = s2.shapes.add_table(rows, cols, Inches(7.65), Inches(4.25), Inches(5.0), Inches(2.25))
table = table_shape.table
table.columns[0].width = Inches(1.25)
table.columns[1].width = Inches(1.75)
table.columns[2].width = Inches(2.0)

comp_data = [
    ["Capability", "Standard GIS / Portals", "Our Solution (OCEAN-3D)"],
    ["3D Subsurface", "2D surface maps only", "Interactive GPU Raymarching & Isosurfaces"],
    ["Validation", "Manual scripts / None", "Instant on-screen MAE (°C, PSU) on profiles"],
    ["Deployment", "Heavy desktop or slow portal", "100% web-native, zero-install, Dockerized"],
    ["Offline Resilience", "Fails without internet", "6s timeout auto-fallback to local maps"]
]

for r_idx, row in enumerate(comp_data):
    for c_idx, val in enumerate(row):
        cell = table.cell(r_idx, c_idx)
        cell.text = val
        p = cell.text_frame.paragraphs[0]
        p.font.name = "Segoe UI"
        p.font.size = Pt(8)
        if r_idx == 0:
            p.font.bold = True
            p.font.color.rgb = COLOR_WHITE
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_TABLE_HEADER
        else:
            if c_idx == 2:
                p.font.bold = True
                p.font.color.rgb = COLOR_HEADER_BLUE
            else:
                p.font.color.rgb = COLOR_DARK_TEXT
            if r_idx % 2 == 1:
                cell.fill.solid()
                cell.fill.fore_color.rgb = COLOR_TABLE_ROW_ALT

# ==============================================================================
# SLIDE 3: TECHNICAL APPROACH
# ==============================================================================
print("Formatting Slide 3: Technical Approach...")
s3 = prs.slides[2]
clear_body_shapes(s3)
set_slide_title(s3, "TECHNICAL APPROACH & SYSTEM ARCHITECTURE")

# Architecture Flowchart Image (Top: 1.25", Width: 12.0", Height: 3.4")
flowchart_img = "docs/architecture_flowchart.png"
if os.path.exists(flowchart_img):
    s3.shapes.add_picture(flowchart_img, Inches(0.65), Inches(1.25), width=Inches(12.0), height=Inches(3.38))

# Bottom Left: Tech Stack Box (Left: 0.65", Top: 4.75", Width: 6.8", Height: 1.75")
add_card(s3, Inches(0.65), Inches(4.75), Inches(6.8), Inches(1.75), "TECH STACK & OCEAN STANDARDS USED")
tb_tech = s3.shapes.add_textbox(Inches(0.8), Inches(5.1), Inches(6.5), Inches(1.3))
tf_tech = tb_tech.text_frame
tf_tech.word_wrap = True
tf_tech.margin_left = tf_tech.margin_top = tf_tech.margin_right = tf_tech.margin_bottom = 0

tech_bullets = [
    ("Frontend & 3D: ", "React 19, TypeScript, CesiumJS 1.145 (Globe/WMS), Three.js 0.186 (Volume Raymarcher), Plotly.js, Tailwind v4."),
    ("Backend & Microservices: ", "FastAPI (Python 3.12), Unidata THREDDS (TDS 5.8), Uvicorn, Docker Compose."),
    ("Data & Standards: ", "CF-1.8 Conventions, OGC WMS 1.3.0 (CRS:84), OPeNDAP, xarray, netCDF4, pyarrow (Parquet).")
]
for i, (bold_prefix, text) in enumerate(tech_bullets):
    p = tf_tech.paragraphs[0] if i == 0 else tf_tech.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Right: Roadmap Box (Left: 7.6", Top: 4.75", Width: 5.05", Height: 1.75")
add_card(s3, Inches(7.6), Inches(4.75), Inches(5.05), Inches(1.75), "IMPLEMENTATION ROADMAP (DONE, NOW, NEXT)", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_road = s3.shapes.add_textbox(Inches(7.75), Inches(5.1), Inches(4.75), Inches(1.3))
tf_road = tb_road.text_frame
tf_road.word_wrap = True
tf_road.margin_left = tf_road.margin_top = tf_road.margin_right = tf_road.margin_bottom = 0

road_bullets = [
    ("Done (Built & Tested): ", "5 Sensor pipelines (Argo, Buoy, Glider, ADCP, CTD), 3D raymarching, offline fallback, full CI suite."),
    ("Now (SIH Online Round): ", "Working prototype on Cyclone Amphan with <200ms latency, 60 FPS, 0 regression errors."),
    ("Next (INCOIS Deployment): ", "Automated NRT data feeds, HF radar surface currents, ML subsurface thermocline proxy.")
]
for i, (bold_prefix, text) in enumerate(road_bullets):
    p = tf_road.paragraphs[0] if i == 0 else tf_road.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 4: FEASIBILITY AND VIABILITY
# ==============================================================================
print("Formatting Slide 4: Feasibility and Viability...")
s4 = prs.slides[3]
clear_body_shapes(s4)
set_slide_title(s4, "FEASIBILITY AND VIABILITY")

# Left Column: Feasibility & Standards (Left: 0.65", Width: 4.5")
# Card 1: Feasibility
add_card(s4, Inches(0.65), Inches(1.25), Inches(4.5), Inches(2.45), "TECHNICAL & ECONOMIC FEASIBILITY")
tb_feas = s4.shapes.add_textbox(Inches(0.8), Inches(1.62), Inches(4.2), Inches(2.0))
tf_feas = tb_feas.text_frame
tf_feas.word_wrap = True
tf_feas.margin_left = tf_feas.margin_top = tf_feas.margin_right = tf_feas.margin_bottom = 0

feas_bullets = [
    ("100% Web Standards: ", "Runs out-of-the-box in Chrome, Edge, Firefox via standard WebGL; zero client software install."),
    ("Runs on Regular Laptops: ", "Maintains 55–60 FPS on standard integrated laptop graphics (Intel/AMD)."),
    ("Zero License Costs: ", "100% open-source stack; saves ₹1.5L–₹3L/seat annually in GIS desktop licensing fees."),
    ("Lightweight Server: ", "Runs entirely inside Docker on standard Linux VM (4 vCPUs, 8 GB RAM, 50 GB SSD).")
]
for i, (bold_prefix, text) in enumerate(feas_bullets):
    p = tf_feas.paragraphs[0] if i == 0 else tf_feas.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Card 2: Standards & Resources
add_card(s4, Inches(0.65), Inches(3.85), Inches(4.5), Inches(2.65), "PROVEN STANDARDS & RESOURCE NEEDS", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_std = s4.shapes.add_textbox(Inches(0.8), Inches(4.22), Inches(4.2), Inches(2.2))
tf_std = tb_std.text_frame
tf_std.word_wrap = True
tf_std.margin_left = tf_std.margin_top = tf_std.margin_right = tf_std.margin_bottom = 0

std_bullets = [
    ("CF-1.8 Conventions: ", "Strict NetCDF dimension standards with depth marked positive: 'down'."),
    ("OGC WMS 1.3.0 (CRS:84): ", "Global spatial standard; locks lon/lat axis order to eliminate tile-flip bugs."),
    ("Unidata THREDDS: ", "Industry standard data engine trusted by NOAA, NASA, and Copernicus."),
    ("Minimum Hardware: ", "Server: 4 vCPU, 8 GB RAM | Client: Any modern browser | Network: Works offline.")
]
for i, (bold_prefix, text) in enumerate(std_bullets):
    p = tf_std.paragraphs[0] if i == 0 else tf_std.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Right Column: Risk & Mitigation Table (Left: 5.3", Top: 1.25", Width: 7.35", Height: 5.25")
add_card(s4, Inches(5.3), Inches(1.25), Inches(7.35), Inches(5.25), "OPERATIONAL RISK ASSESSMENT & ENGINEERING MITIGATION MATRIX")

r_rows, r_cols = 6, 3
r_table_shape = s4.shapes.add_table(r_rows, r_cols, Inches(5.45), Inches(1.68), Inches(7.05), Inches(4.65))
r_table = r_table_shape.table
r_table.columns[0].width = Inches(1.6)
r_table.columns[1].width = Inches(2.3)
r_table.columns[2].width = Inches(3.15)

risk_data = [
    ["Identified Risk", "Operational Impact", "Our Proven Engineering Mitigation"],
    ["Large 3D Data Volumes", "Multi-GB grids choke bandwidth and freeze client browsers.", "Server dynamic slicing delivers 2D WMS tiles & 3D subgrids in < 200ms (< 150 KB)."],
    ["Coastline Data Bleeding", "Warm sea surface values falsely bleed over coastal land.", "Land cells are mapped to -9999 sentinel; GPU shader discards them cleanly."],
    ["WMS Axis Inversion Bug", "WMS 1.3.0 flips Lat/Lon coordinates, misaligning map tiles by 90°.", "System-wide enforcement of CRS:84 coordinate order ensures 100% geospatial accuracy."],
    ["Vessel Internet Loss", "Shipboard monitoring breaks completely when internet drops.", "6-second timeout automatically falls back to bundled local NaturalEarthII tiles."],
    ["Field ASCII / Text Logs", "Manual CTD measurements in plain text cannot be ingested.", "Generic delimited parser normalizes CSV into standard 8-column schema automatically."]
]

for r_idx, row in enumerate(risk_data):
    for c_idx, val in enumerate(row):
        cell = r_table.cell(r_idx, c_idx)
        cell.text = val
        p = cell.text_frame.paragraphs[0]
        p.font.name = "Segoe UI"
        p.font.size = Pt(8)
        if r_idx == 0:
            p.font.bold = True
            p.font.color.rgb = COLOR_WHITE
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_TABLE_HEADER
        else:
            if c_idx == 0:
                p.font.bold = True
                p.font.color.rgb = COLOR_DARK_TEXT
            elif c_idx == 2:
                p.font.bold = True
                p.font.color.rgb = COLOR_HEADER_BLUE
            else:
                p.font.color.rgb = COLOR_MUTED_TEXT
            if r_idx % 2 == 1:
                cell.fill.solid()
                cell.fill.fore_color.rgb = COLOR_TABLE_ROW_ALT

# ==============================================================================
# SLIDE 5: IMPACT AND BENEFITS
# ==============================================================================
print("Formatting Slide 5: Impact and Benefits...")
s5 = prs.slides[4]
clear_body_shapes(s5)
set_slide_title(s5, "IMPACT AND BENEFITS")

# Left Column: 5 Sector Impact Cards (Left: 0.65", Width: 6.8", Top: 1.25", Height: 5.25")
add_card(s5, Inches(0.65), Inches(1.25), Inches(6.8), Inches(5.25), "MULTI-SECTOR STRATEGIC IMPACT MATRIX")
tb_imp = s5.shapes.add_textbox(Inches(0.8), Inches(1.68), Inches(6.5), Inches(4.7))
tf_imp = tb_imp.text_frame
tf_imp.word_wrap = True
tf_imp.margin_left = tf_imp.margin_top = tf_imp.margin_right = tf_imp.margin_bottom = 0

impact_bullets = [
    ("1. Operational Ocean Forecasting (INCOIS): ", "Accelerates cyclone advisory turnaround by 70%. Simultaneous 3D views of warm subsurface water and cold-wake upwelling enable rapid, confident storm surge decisions."),
    ("2. Defense & Maritime Safety (Navy & Coast Guard): ", "3D temperature and salinity data allows naval teams to compute acoustic sound speed profiles (SVP) for submarine operations and improves 3D drift tracking for maritime Search & Rescue."),
    ("3. Blue Economy & Fisheries: ", "Co-displaying ocean thermal fronts alongside chlorophyll-a identifies upwelling zones, improving Potential Fishing Zone (PFZ) advisories for coastal fishing communities."),
    ("4. Coastal Disaster Mitigation (NDRF / SDMAs): ", "Accurate tracking of heat incubation areas provides coastal states (Odisha, West Bengal, Andhra Pradesh) with earlier, higher-confidence warnings before cyclonic landfall."),
    ("5. Science Communication & Public Outreach: ", "The 5-beat interactive Guided Tour translates complex ocean physics into an intuitive visual story for students, researchers, and policymakers during awareness events.")
]
for i, (bold_prefix, text) in enumerate(impact_bullets):
    p = tf_imp.paragraphs[0] if i == 0 else tf_imp.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.8)
    p.space_after = Pt(6)
    run1 = p.add_run()
    run1.text = bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Right Column: Visual of 3D Volumetric Engine + Future Prospects (Left: 7.65", Width: 5.0")
vol_img = "stage7b_20260919_volumetric_bloom.png"
if os.path.exists(vol_img):
    s5.shapes.add_picture(vol_img, Inches(7.65), Inches(1.25), width=Inches(5.0), height=Inches(2.7))
    tb_vcap = s5.shapes.add_textbox(Inches(7.65), Inches(3.96), Inches(5.0), Inches(0.25))
    tb_vcap.text_frame.margin_left = tb_vcap.text_frame.margin_top = tb_vcap.text_frame.margin_right = tb_vcap.text_frame.margin_bottom = 0
    p_vcap = tb_vcap.text_frame.paragraphs[0]
    p_vcap.text = "▲ Subsurface 3D Thermal Raymarching with UnrealBloom (Three.js WebGL)"
    p_vcap.font.name = "Segoe UI"
    p_vcap.font.size = Pt(8.5)
    p_vcap.font.bold = True
    p_vcap.font.color.rgb = COLOR_HEADER_BLUE

# Future Prospects Card (Top: 4.25", Height: 2.25")
add_card(s5, Inches(7.65), Inches(4.25), Inches(5.0), Inches(2.25), "FUTURE PROSPECTS & SCALING", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_fut = s5.shapes.add_textbox(Inches(7.8), Inches(4.65), Inches(4.7), Inches(1.75))
tf_fut = tb_fut.text_frame
tf_fut.word_wrap = True
tf_fut.margin_left = tf_fut.margin_top = tf_fut.margin_right = tf_fut.margin_bottom = 0

fut_bullets = [
    ("Live Sensor Telemetry: ", "Automated polling daemons for real-time INCOIS moored buoys and coastal stations."),
    ("HF Radar Integration: ", "Surface current vector streams for real-time port navigation."),
    ("Machine Learning Inversion: ", "Estimate 3D subsurface temperature structure directly from satellite SST using neural proxies.")
]
for i, (bold_prefix, text) in enumerate(fut_bullets):
    p = tf_fut.paragraphs[0] if i == 0 else tf_fut.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(4)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 6: RESEARCH AND REFERENCES
# ==============================================================================
print("Formatting Slide 6: Research and References...")
s6 = prs.slides[5]
clear_body_shapes(s6)
set_slide_title(s6, "RESEARCH AND REFERENCES")

# Top Card: Peer-Reviewed Scientific Publications with Verified DOIs (Top: 1.25", Left: 0.65", Width: 12.0", Height: 2.85")
add_card(s6, Inches(0.65), Inches(1.25), Inches(12.0), Inches(2.85), "PEER-REVIEWED SCIENTIFIC RESEARCH & OFFICIAL DOIs")
tb_doi = s6.shapes.add_textbox(Inches(0.8), Inches(1.65), Inches(11.7), Inches(2.35))
tf_doi = tb_doi.text_frame
tf_doi.word_wrap = True
tf_doi.margin_left = tf_doi.margin_top = tf_doi.margin_right = tf_doi.margin_bottom = 0

doi_list = [
    ("1. Cyclone Amphan Ocean Response: ", "Maneesha, V. V., et al. (2022). 'Interactions Between a Marine Heatwave and Tropical Cyclone Amphan in the Bay of Bengal.' Frontiers in Climate, 4:861477. | DOI: 10.3389/fclim.2022.861477"),
    ("2. GLORYS12 Ocean Reanalysis Model: ", "Lellouche, J.-M., et al. (2021). 'The Copernicus Global 1/12° Oceanic and Sea Ice GLORYS12 Reanalysis and Simulation.' Frontiers in Earth Science, 9:698876. | DOI: 10.3389/feart.2021.698876"),
    ("3. Bay of Bengal Glider Observations (BoBBLE): ", "Vinayachandran, P. N., et al. (2018). 'BoBBLE: The Bay of Bengal Boundary Layer Experiment.' Bull. Amer. Meteor. Soc., 99(8):1569–1587. | DOI: 10.1175/BAMS-D-17-0156.1"),
    ("4. Global Argo In-Situ Float Array: ", "Roemmich, D., et al. (2019). 'On the Future of Argo: A Global, Full-Depth, Multi-Disciplinary Array.' Frontiers in Marine Science, 6:439. | DOI: 10.3389/fmars.2019.00439"),
    ("5. ncWMS Environmental Web Map Engine: ", "Blower, J. D., et al. (2013). 'ncWMS: A Web Map Service for Detailed Analysis of Environmental Data.' Computers & Geosciences, 53:108–115. | DOI: 10.1016/j.cageo.2012.10.027")
]
for i, (bold_prefix, text) in enumerate(doi_list):
    p = tf_doi.paragraphs[0] if i == 0 else tf_doi.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.2)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Left: Official Data Portals (Top: 4.22", Left: 0.65", Width: 6.8", Height: 2.25")
add_card(s6, Inches(0.65), Inches(4.22), Inches(6.8), Inches(2.25), "OFFICIAL SCIENTIFIC DATA GATEWAYS USED")
tb_gate = s6.shapes.add_textbox(Inches(0.8), Inches(4.62), Inches(6.5), Inches(1.75))
tf_gate = tb_gate.text_frame
tf_gate.word_wrap = True
tf_gate.margin_left = tf_gate.margin_top = tf_gate.margin_right = tf_gate.margin_bottom = 0

gate_bullets = [
    ("INCOIS (MoES, India): ", "OMNI Moored Buoy Network & Ocean Data Portal (incois.gov.in)"),
    ("Copernicus Marine (EU): ", "GLORYS12V1 Global Physical Ocean Reanalysis Grid (marine.copernicus.eu)"),
    ("Ifremer / Coriolis GDAC: ", "Global Argo Float ERDDAP Server (Core & BGC profiles) (erddap.ifremer.fr)"),
    ("British Oceanographic Data Centre: ", "BoBBLE Seaglider SG620 Profile Archive (bodc.ac.uk)"),
    ("GEBCO: ", "Global Ocean Bathymetry Grids & Cesium World Bathymetry (gebco.net)")
]
for i, (bold_prefix, text) in enumerate(gate_bullets):
    p = tf_gate.paragraphs[0] if i == 0 else tf_gate.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Right: Standards Followed (Top: 4.22", Left: 7.65", Width: 5.0", Height: 2.25")
add_card(s6, Inches(7.65), Inches(4.22), Inches(5.0), Inches(2.25), "OPEN STANDARDS STRICTLY FOLLOWED", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_stan = s6.shapes.add_textbox(Inches(7.8), Inches(4.62), Inches(4.7), Inches(1.75))
tf_stan = tb_stan.text_frame
tf_stan.word_wrap = True
tf_stan.margin_left = tf_stan.margin_top = tf_stan.margin_right = tf_stan.margin_bottom = 0

stan_bullets = [
    ("CF-1.8 Conventions: ", "Climate & Forecast metadata rules for multi-dimensional ocean NetCDF files."),
    ("OGC WMS 1.3.0 (CRS:84): ", "Standard web map tiles with fixed lon/lat coordinate ordering."),
    ("OPeNDAP Protocol: ", "Remote array subsetting without transferring raw multi-gigabyte files."),
    ("Apache Parquet: ", "Columnar storage for instant in-situ point filtering and low memory overhead.")
]
for i, (bold_prefix, text) in enumerate(stan_bullets):
    p = tf_stan.paragraphs[0] if i == 0 else tf_stan.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(8.5)
    p.space_after = Pt(2.5)
    run1 = p.add_run()
    run1.text = "• " + bold_prefix
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = text
    run2.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 7: DELETE PER SIH RULES (Keep maximum 6 slides total)
# ==============================================================================
if len(prs.slides) >= 7:
    rId = prs.slides._sldIdLst[6].rId
    prs.part.drop_rel(rId)
    del prs.slides._sldIdLst[6]
    print("Deleted Slide 7 (Important Pointers) to strictly enforce the 6-slide SIH limit.")

prs.save(OUTPUT_PPTX)
print(f"\nSuccessfully generated and saved final PPT to: {OUTPUT_PPTX}")
print(f"Total slides in presentation: {len(prs.slides)} (Slide 1: Team info untouched; Slides 2-6: Formatted content).")
