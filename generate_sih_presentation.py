"""Generate the updated SIH 2026 presentation with enlarged readable typography,
generous line spacing, the new full-interface prototype screenshot on Slide 2,
and strict adherence to the exact technical facts from the project.
"""

import os
import shutil
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

ORIGINAL_PPTX = "SIH2026-IDEA-Presentation-Format-Backup.pptx"
OUTPUT_PPTX = "SIH2026-IDEA-Presentation-Format.pptx"

prs = Presentation(ORIGINAL_PPTX)

# Typography & Color Palette
COLOR_NAVY_TITLE = RGBColor(15, 23, 42)       # #0f172a
COLOR_HEADER_BLUE = RGBColor(2, 132, 199)     # #0284c7
COLOR_DARK_TEXT = RGBColor(30, 41, 59)        # #1e293b
COLOR_MUTED_TEXT = RGBColor(71, 85, 105)      # #475569
COLOR_CARD_BG = RGBColor(248, 250, 252)       # #f8fafc
COLOR_CARD_BORDER = RGBColor(203, 213, 225)   # #cbd5e1
COLOR_ACCENT_BLUE = RGBColor(239, 246, 255)   # #eff6ff
COLOR_ACCENT_BORDER = RGBColor(147, 197, 253) # #93c5fd
COLOR_WHITE = RGBColor(255, 255, 255)
COLOR_TABLE_HEADER = RGBColor(30, 41, 59)
COLOR_TABLE_ROW_ALT = RGBColor(241, 245, 249)

def clear_body_shapes(slide):
    """Remove template body placeholders and temporary shapes, keeping header/footer."""
    shapes_to_remove = []
    for shape in slide.shapes:
        name = shape.name.lower()
        if "textbox 8" in name or "content placeholder" in name or "round diagonal" in name:
            shapes_to_remove.append(shape)
    for shape in shapes_to_remove:
        sp = shape._element
        sp.getparent().remove(sp)

def set_slide_title(slide, title_text):
    """Find and format the main slide title with prominent 26pt bold typography."""
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
            shape.width = Inches(9.8)
            shape.height = Inches(0.9)
            return

def add_card(slide, left, top, width, height, title, bg_color=COLOR_CARD_BG, border_color=COLOR_CARD_BORDER, title_size=13):
    """Add a structured visual container card with bold header."""
    rect = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    rect.fill.solid()
    rect.fill.fore_color.rgb = bg_color
    rect.line.color.rgb = border_color
    rect.line.width = Pt(1.2)
    
    tb = slide.shapes.add_textbox(left + Inches(0.16), top + Inches(0.1), width - Inches(0.32), Inches(0.35))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = "Segoe UI"
    p.font.size = Pt(title_size)
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

# Top Left: Problem Card (Width: 5.85", Height: 2.65", Left: 0.7", Top: 1.3")
add_card(s2, Inches(0.7), Inches(1.3), Inches(5.85), Inches(2.65), "OPERATIONAL PROBLEM & GAPS (INCOIS)")
tb_p = s2.shapes.add_textbox(Inches(0.88), Inches(1.72), Inches(5.5), Inches(2.15))
tf_p = tb_p.text_frame
tf_p.word_wrap = True
tf_p.margin_left = tf_p.margin_top = tf_p.margin_right = tf_p.margin_bottom = 0

p_bullets = [
    ("Disconnected Data: ", "Model grids (NetCDF) and field observations (Argo, Buoys, Gliders) sit in isolated tools."),
    ("Decision Delays: ", "Forecasters toggle between GIS maps and Python scripts, wasting 15–30 mins in cyclones."),
    ("2D Subsurface Blindspot: ", "Web portals only show surface maps (SST), hiding subsurface heat that fuels cyclones."),
    ("No Direct Verification: ", "Forecasters cannot verify model predictions against collocated ground truth on one screen.")
]
for i, (bold_pfx, txt) in enumerate(p_bullets):
    p = tf_p.paragraphs[0] if i == 0 else tf_p.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11.5)
    p.space_after = Pt(6)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Top Right: Proposed Solution Card (Width: 5.85", Height: 2.65", Left: 6.85", Top: 1.3")
add_card(s2, Inches(6.85), Inches(1.3), Inches(5.85), Inches(2.65), "OUR SOLUTION: OCEAN-3D PLATFORM", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_s = s2.shapes.add_textbox(Inches(7.03), Inches(1.72), Inches(5.5), Inches(2.15))
tf_s = tb_s.text_frame
tf_s.word_wrap = True
tf_s.margin_left = tf_p.margin_top = tf_s.margin_right = tf_s.margin_bottom = 0

s_bullets = [
    ("Unified Web Platform: ", "Runs directly in any browser with zero installation, uniting 4D models & multi-sensor profiles."),
    ("Dual 3D WebGL Engine: ", "CesiumJS for 4D globe navigation + Three.js for 3D subsurface volumetric raymarching."),
    ("Instant Model Validation: ", "Automatically calculates forecast error (Mean Absolute Error in °C & PSU) on profile charts."),
    ("Dual Operational Modes: ", "Forecaster Mode (tools, depth slices, colorbars) + Public Tour Mode (5-beat Cyclone story).")
]
for i, (bold_pfx, txt) in enumerate(s_bullets):
    p = tf_s.paragraphs[0] if i == 0 else tf_s.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11.5)
    p.space_after = Pt(6)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Left: The New Full Screenshot (Left: 0.7", Top: 4.12", Width: 4.9", Height: 2.25")
new_screenshot = "slide2_prototype_full.png"
if os.path.exists(new_screenshot):
    s2.shapes.add_picture(new_screenshot, Inches(0.7), Inches(4.12), width=Inches(4.9), height=Inches(2.25))

# Bottom Right: Key Differences Table (Left: 5.75", Top: 4.12", Width: 6.95", Height: 2.25")
add_card(s2, Inches(5.75), Inches(4.12), Inches(6.95), Inches(2.25), "WHY OUR SOLUTION IS DIFFERENT FROM EXISTING TOOLS", title_size=12)
t_shape = s2.shapes.add_table(4, 3, Inches(5.9), Inches(4.5), Inches(6.65), Inches(1.75))
t = t_shape.table
t.columns[0].width = Inches(1.4)
t.columns[1].width = Inches(2.25)
t.columns[2].width = Inches(3.0)

comp_rows = [
    ["Capability", "Standard GIS / Portals", "Our Solution (OCEAN-3D)"],
    ["3D Subsurface", "2D surface maps only", "Interactive GPU Raymarching with land masking"],
    ["Model vs. Obs", "Manual scripts / None", "Instant on-screen MAE (°C, PSU) on profiles"],
    ["Offline Ready", "Fails without internet", "6s timeout auto-fallback to local maps"]
]
for r_i, r in enumerate(comp_rows):
    for c_i, val in enumerate(r):
        cell = t.cell(r_i, c_i)
        cell.text = val
        p = cell.text_frame.paragraphs[0]
        p.font.name = "Segoe UI"
        p.font.size = Pt(10)
        if r_i == 0:
            p.font.bold = True
            p.font.color.rgb = COLOR_WHITE
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_TABLE_HEADER
        else:
            if c_i == 2:
                p.font.bold = True
                p.font.color.rgb = COLOR_HEADER_BLUE
            else:
                p.font.color.rgb = COLOR_DARK_TEXT
            if r_i % 2 == 1:
                cell.fill.solid()
                cell.fill.fore_color.rgb = COLOR_TABLE_ROW_ALT

# ==============================================================================
# SLIDE 3: TECHNICAL APPROACH
# ==============================================================================
print("Formatting Slide 3: Technical Approach...")
s3 = prs.slides[2]
clear_body_shapes(s3)
set_slide_title(s3, "TECHNICAL APPROACH & SYSTEM ARCHITECTURE")

# Architecture Flowchart Image (Top: 1.3", Width: 12.0", Height: 2.95")
flowchart_img = "docs/architecture_flowchart.png"
if os.path.exists(flowchart_img):
    s3.shapes.add_picture(flowchart_img, Inches(0.7), Inches(1.3), width=Inches(12.0), height=Inches(2.95))

# Bottom Left: Tech Stack Box (Left: 0.7", Top: 4.45", Width: 6.2", Height: 2.15")
add_card(s3, Inches(0.7), Inches(4.45), Inches(6.2), Inches(2.15), "TECH STACK & OCEAN STANDARDS USED")
tb_t = s3.shapes.add_textbox(Inches(0.88), Inches(4.85), Inches(5.85), Inches(1.65))
tf_t = tb_t.text_frame
tf_t.word_wrap = True
tf_t.margin_left = tf_t.margin_top = tf_t.margin_right = tf_t.margin_bottom = 0

tech_data = [
    ("Frontend & 3D: ", "React 19, TypeScript, CesiumJS 1.145 (Globe/WMS), Three.js 0.186 (Raymarching), Plotly.js, Tailwind CSS v4."),
    ("Backend & Microservices: ", "FastAPI (Python 3.12), Unidata THREDDS (TDS 5.8), Uvicorn, Docker Compose."),
    ("Data Standards: ", "CF-1.8 NetCDF-4, OGC WMS 1.3.0 (CRS:84), OPeNDAP, xarray, netCDF4, pyarrow (Parquet).")
]
for i, (bold_pfx, txt) in enumerate(tech_data):
    p = tf_t.paragraphs[0] if i == 0 else tf_t.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(5)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Right: Roadmap Box (Left: 7.1", Top: 4.45", Width: 5.6", Height: 2.15")
add_card(s3, Inches(7.1), Inches(4.45), Inches(5.6), Inches(2.15), "ROADMAP: DONE, NOW, NEXT", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_r = s3.shapes.add_textbox(Inches(7.28), Inches(4.85), Inches(5.25), Inches(1.65))
tf_r = tb_r.text_frame
tf_r.word_wrap = True
tf_r.margin_left = tf_r.margin_top = tf_r.margin_right = tf_r.margin_bottom = 0

roadmap_data = [
    ("Done (Built & Tested): ", "5 Sensor pipelines (Argo, Buoy, Glider, ADCP, CTD), 3D raymarching, offline fallback, full CI test suite."),
    ("Now (SIH Online Round): ", "Working prototype on Cyclone Amphan with <200ms latency, 60 FPS, 0 regression errors."),
    ("Next (INCOIS Deployment): ", "Automated NRT data feeds, coastal HF radar currents, ML subsurface thermocline proxy.")
]
for i, (bold_pfx, txt) in enumerate(roadmap_data):
    p = tf_r.paragraphs[0] if i == 0 else tf_r.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(5)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 4: FEASIBILITY AND VIABILITY
# ==============================================================================
print("Formatting Slide 4: Feasibility and Viability...")
s4 = prs.slides[3]
clear_body_shapes(s4)
set_slide_title(s4, "FEASIBILITY AND VIABILITY")

# Left Column: Feasibility & Standards (Width: 4.6", Left: 0.7")
# Card 1: Feasibility
add_card(s4, Inches(0.7), Inches(1.3), Inches(4.6), Inches(2.5), "FEASIBILITY & COST ADVANTAGE")
tb_fe = s4.shapes.add_textbox(Inches(0.88), Inches(1.72), Inches(4.25), Inches(2.0))
tf_fe = tb_fe.text_frame
tf_fe.word_wrap = True
tf_fe.margin_left = tf_fe.margin_top = tf_fe.margin_right = tf_fe.margin_bottom = 0

feas_data = [
    ("100% Web Standards: ", "Runs out-of-the-box in Chrome, Edge, Firefox via standard WebGL; zero client software install."),
    ("Runs on Regular Laptops: ", "Maintains 55–60 FPS on standard integrated laptop graphics (Intel/AMD)."),
    ("Zero License Costs: ", "100% open-source stack; saves ₹1.5L–₹3L/seat annually in GIS desktop licensing fees."),
    ("Lightweight Server: ", "Runs inside Docker on a standard Linux VM (4 vCPUs, 8 GB RAM, 50 GB SSD).")
]
for i, (bold_pfx, txt) in enumerate(feas_data):
    p = tf_fe.paragraphs[0] if i == 0 else tf_fe.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(5)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Card 2: Standards
add_card(s4, Inches(0.7), Inches(3.95), Inches(4.6), Inches(2.55), "PROVEN INDUSTRY FRAMEWORKS", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_st = s4.shapes.add_textbox(Inches(0.88), Inches(4.37), Inches(4.25), Inches(2.0))
tf_st = tb_st.text_frame
tf_st.word_wrap = True
tf_st.margin_left = tf_st.margin_top = tf_st.margin_right = tf_st.margin_bottom = 0

std_data = [
    ("CF-1.8 Conventions: ", "Strict NetCDF dimension standards with depth marked positive: 'down'."),
    ("OGC WMS 1.3.0 (CRS:84): ", "Global spatial standard; locks lon/lat axis order to eliminate tile-flip bugs."),
    ("Unidata THREDDS: ", "Industry standard data engine trusted by NOAA, NASA, and Copernicus."),
    ("Minimum Hardware: ", "Server: 4 vCPU, 8 GB RAM | Client: Any modern browser | Network: Works offline.")
]
for i, (bold_pfx, txt) in enumerate(std_data):
    p = tf_st.paragraphs[0] if i == 0 else tf_st.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(5)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Right Column: Risk & Mitigation Table (Width: 7.15", Left: 5.5", Top: 1.3", Height: 5.2")
add_card(s4, Inches(5.5), Inches(1.3), Inches(7.15), Inches(5.2), "RISK ASSESSMENT & ENGINEERING MITIGATIONS")

r_rows, r_cols = 5, 3
r_table_shape = s4.shapes.add_table(r_rows, r_cols, Inches(5.68), Inches(1.78), Inches(6.8), Inches(4.55))
r_table = r_table_shape.table
r_table.columns[0].width = Inches(1.7)
r_table.columns[1].width = Inches(2.25)
r_table.columns[2].width = Inches(2.85)

risk_data = [
    ["Real Challenge", "Operational Impact", "Our Proven Engineering Solution"],
    ["Large 3D Data Files", "Multi-GB grids choke bandwidth and freeze client browsers.", "Server dynamic slicing delivers 2D WMS tiles & 3D subgrids in < 200ms (< 150 KB)."],
    ["Coastline Data Bleeding", "Warm sea surface values falsely bleed over coastal land.", "Land cells are mapped to -9999 sentinel; GPU shader discards them cleanly."],
    ["WMS Axis Inversion Bug", "WMS 1.3.0 flips Lat/Lon coordinates, misaligning map tiles by 90°.", "System-wide enforcement of CRS:84 coordinate order ensures 100% geospatial accuracy."],
    ["Vessel Internet Loss", "Shipboard monitoring breaks completely when internet drops.", "6-second timeout automatically falls back to bundled local NaturalEarthII tiles."]
]

for r_idx, row in enumerate(risk_data):
    for c_idx, val in enumerate(row):
        cell = r_table.cell(r_idx, c_idx)
        cell.text = val
        p = cell.text_frame.paragraphs[0]
        p.font.name = "Segoe UI"
        p.font.size = Pt(10.5)
        p.line_spacing = 1.15
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

# Left Column: 5 Sector Impact Cards (Left: 0.7", Width: 6.8", Top: 1.3", Height: 5.2")
add_card(s5, Inches(0.7), Inches(1.3), Inches(6.8), Inches(5.2), "MULTI-SECTOR STRATEGIC IMPACT MATRIX")
tb_im = s5.shapes.add_textbox(Inches(0.88), Inches(1.75), Inches(6.45), Inches(4.65))
tf_im = tb_im.text_frame
tf_im.word_wrap = True
tf_im.margin_left = tf_im.margin_top = tf_im.margin_right = tf_im.margin_bottom = 0

impact_data = [
    ("1. Operational Ocean Forecasting (INCOIS): ", "Accelerates cyclone advisory turnaround by 70%. Simultaneous 3D views of warm subsurface water and cold-wake upwelling enable rapid, confident storm surge decisions."),
    ("2. Defense & Maritime Safety (Navy & Coast Guard): ", "3D temperature and salinity data allows naval teams to compute acoustic sound speed profiles (SVP) for submarine operations and improves 3D drift tracking for maritime Search & Rescue."),
    ("3. Blue Economy & Fisheries: ", "Co-displaying ocean thermal fronts alongside chlorophyll-a identifies upwelling zones, improving Potential Fishing Zone (PFZ) advisories for coastal fishing communities."),
    ("4. Coastal Disaster Mitigation (NDRF / SDMAs): ", "Accurate tracking of heat incubation areas provides coastal states (Odisha, West Bengal, Andhra Pradesh) with earlier, higher-confidence warnings before cyclonic landfall."),
    ("5. Science Communication & Public Outreach: ", "The 5-beat interactive Guided Tour translates complex ocean physics into an intuitive visual story for students, researchers, and policymakers during awareness events.")
]
for i, (bold_pfx, txt) in enumerate(impact_data):
    p = tf_im.paragraphs[0] if i == 0 else tf_im.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11.2)
    p.space_after = Pt(7)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Right Column: 3D Volumetric Visual + Future Prospects (Left: 7.7", Width: 5.0")
vol_img = "stage7b_20260919_volumetric_bloom.png"
if os.path.exists(vol_img):
    s5.shapes.add_picture(vol_img, Inches(7.7), Inches(1.3), width=Inches(5.0), height=Inches(2.55))
    tb_vc = s5.shapes.add_textbox(Inches(7.7), Inches(3.88), Inches(5.0), Inches(0.25))
    tb_vc.text_frame.margin_left = tb_vc.text_frame.margin_top = tb_vc.text_frame.margin_right = tb_vc.text_frame.margin_bottom = 0
    p_vc = tb_vc.text_frame.paragraphs[0]
    p_vc.text = "▲ Subsurface 3D Thermal Raymarching with UnrealBloom (Three.js WebGL)"
    p_vc.font.name = "Segoe UI"
    p_vc.font.size = Pt(8.5)
    p_vc.font.bold = True
    p_vc.font.color.rgb = COLOR_HEADER_BLUE

# Future Prospects Card (Top: 4.18", Height: 2.32", Width: 5.0")
add_card(s5, Inches(7.7), Inches(4.18), Inches(5.0), Inches(2.32), "FUTURE PROSPECTS & SCALING", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_fu = s5.shapes.add_textbox(Inches(7.88), Inches(4.58), Inches(4.65), Inches(1.8))
tf_fu = tb_fu.text_frame
tf_fu.word_wrap = True
tf_fu.margin_left = tf_fu.margin_top = tf_fu.margin_right = tf_fu.margin_bottom = 0

fut_data = [
    ("Live Sensor Telemetry: ", "Automated polling daemons for real-time INCOIS moored buoys and coastal stations."),
    ("HF Radar Streams: ", "Coastal surface current vector feeds for real-time port navigation."),
    ("Machine Learning Inversion: ", "Estimate 3D subsurface temperature structure directly from satellite SST using neural proxies.")
]
for i, (bold_pfx, txt) in enumerate(fut_data):
    p = tf_fu.paragraphs[0] if i == 0 else tf_fu.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(5)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# ==============================================================================
# SLIDE 6: RESEARCH AND REFERENCES
# ==============================================================================
print("Formatting Slide 6: Research and References...")
s6 = prs.slides[5]
clear_body_shapes(s6)
set_slide_title(s6, "RESEARCH AND REFERENCES")

# Top Card: Peer-Reviewed Scientific Research (Top: 1.3", Left: 0.7", Width: 12.0", Height: 2.75")
add_card(s6, Inches(0.7), Inches(1.3), Inches(12.0), Inches(2.75), "PEER-REVIEWED SCIENTIFIC RESEARCH & OFFICIAL DOIs")
tb_d = s6.shapes.add_textbox(Inches(0.88), Inches(1.72), Inches(11.6), Inches(2.25))
tf_d = tb_d.text_frame
tf_d.word_wrap = True
tf_d.margin_left = tf_d.margin_top = tf_d.margin_right = tf_d.margin_bottom = 0

doi_data = [
    ("1. Cyclone Amphan Ocean Response: ", "Maneesha, V. V., et al. (2022). 'Interactions Between a Marine Heatwave and Tropical Cyclone Amphan in the Bay of Bengal.' Frontiers in Climate, 4:861477. | DOI: 10.3389/fclim.2022.861477"),
    ("2. GLORYS12 Ocean Reanalysis Model: ", "Lellouche, J.-M., et al. (2021). 'The Copernicus Global 1/12° Oceanic and Sea Ice GLORYS12 Reanalysis and Simulation.' Frontiers in Earth Science, 9:698876. | DOI: 10.3389/feart.2021.698876"),
    ("3. BoBBLE Glider Experiment (Bay of Bengal): ", "Vinayachandran, P. N., et al. (2018). 'BoBBLE: The Bay of Bengal Boundary Layer Experiment.' Bull. Amer. Meteor. Soc., 99(8):1569–1587. | DOI: 10.1175/BAMS-D-17-0156.1"),
    ("4. Global Argo In-Situ Float Array: ", "Roemmich, D., et al. (2019). 'On the Future of Argo: A Global, Full-Depth, Multi-Disciplinary Array.' Frontiers in Marine Science, 6:439. | DOI: 10.3389/fmars.2019.00439"),
    ("5. ncWMS Environmental Web Map Engine: ", "Blower, J. D., et al. (2013). 'ncWMS: A Web Map Service for Detailed Analysis of Environmental Data.' Computers & Geosciences, 53:108–115. | DOI: 10.1016/j.cageo.2012.10.027")
]
for i, (bold_pfx, txt) in enumerate(doi_data):
    p = tf_d.paragraphs[0] if i == 0 else tf_d.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(10.5)
    p.space_after = Pt(4)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Left: Official Data Portals (Top: 4.18", Left: 0.7", Width: 6.8", Height: 2.32")
add_card(s6, Inches(0.7), Inches(4.18), Inches(6.8), Inches(2.32), "OFFICIAL SCIENTIFIC DATA GATEWAYS USED")
tb_g = s6.shapes.add_textbox(Inches(0.88), Inches(4.58), Inches(6.45), Inches(1.85))
tf_g = tb_g.text_frame
tf_g.word_wrap = True
tf_g.margin_left = tf_g.margin_top = tf_g.margin_right = tf_g.margin_bottom = 0

gate_data = [
    ("INCOIS (MoES, India): ", "OMNI Moored Buoy Network & Ocean Data Portal (incois.gov.in)"),
    ("Copernicus Marine (EU): ", "GLORYS12V1 Global Physical Ocean Reanalysis Grid (marine.copernicus.eu)"),
    ("Ifremer / Coriolis GDAC: ", "Global Argo Float ERDDAP Server (Core & BGC profiles) (erddap.ifremer.fr)"),
    ("British Oceanographic Data Centre: ", "BoBBLE Seaglider SG620 Profile Archive (bodc.ac.uk)"),
    ("GEBCO: ", "Global Ocean Bathymetry Grids & Cesium World Bathymetry (gebco.net)")
]
for i, (bold_pfx, txt) in enumerate(gate_data):
    p = tf_g.paragraphs[0] if i == 0 else tf_g.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(4)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Bottom Right: Standards Followed (Top: 4.18", Left: 7.7", Width: 5.0", Height: 2.32")
add_card(s6, Inches(7.7), Inches(4.18), Inches(5.0), Inches(2.32), "OPEN STANDARDS STRICTLY FOLLOWED", bg_color=COLOR_ACCENT_BLUE, border_color=COLOR_ACCENT_BORDER)
tb_sn = s6.shapes.add_textbox(Inches(7.88), Inches(4.58), Inches(4.65), Inches(1.85))
tf_sn = tb_sn.text_frame
tf_sn.word_wrap = True
tf_sn.margin_left = tf_sn.margin_top = tf_sn.margin_right = tf_sn.margin_bottom = 0

stan_data = [
    ("CF-1.8 Conventions: ", "Climate & Forecast metadata rules for multi-dimensional ocean NetCDF files."),
    ("OGC WMS 1.3.0 (CRS:84): ", "Standard web map tiles with fixed lon/lat coordinate ordering."),
    ("OPeNDAP Protocol: ", "Remote array subsetting without transferring raw multi-gigabyte files."),
    ("Apache Parquet: ", "Columnar storage for instant in-situ point filtering and low memory overhead.")
]
for i, (bold_pfx, txt) in enumerate(stan_data):
    p = tf_sn.paragraphs[0] if i == 0 else tf_sn.add_paragraph()
    p.font.name = "Segoe UI"
    p.font.size = Pt(11)
    p.space_after = Pt(4)
    p.line_spacing = 1.15
    run1 = p.add_run()
    run1.text = "• " + bold_pfx
    run1.font.bold = True
    run1.font.color.rgb = COLOR_DARK_TEXT
    run2 = p.add_run()
    run2.text = txt
    run2.font.color.rgb = COLOR_MUTED_TEXT

# Delete Slide 7 (Important Pointers) per SIH rules (max 6 slides total)
if len(prs.slides) >= 7:
    rId = prs.slides._sldIdLst[6].rId
    prs.part.drop_rel(rId)
    del prs.slides._sldIdLst[6]
    print("Deleted Slide 7 (Important Pointers) to strictly enforce the 6-slide SIH limit.")

# Save Presentation
prs.save(OUTPUT_PPTX)
print(f"\nSuccessfully generated and saved readable, uncluttered PPT to: {OUTPUT_PPTX}")
print(f"Total slides in presentation: {len(prs.slides)}")
