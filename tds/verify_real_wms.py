"""Stage 2 Task 5: Empirical verification of real GLORYS12V1 data in TDS.

Queries GetCapabilities and GetMap on http://localhost:8080/thredds/wms/amphan_bob_real/temperature.
Validates CRS:84, BBOX, STYLES, TIME, and ELEVATION dimensions.
Saves test rendered PNG images and inspects pixel color values.
"""

import os
import urllib.request
import xml.etree.ElementTree as ET
from PIL import Image
import io

BASE_URL = "http://localhost:8080/thredds/wms/amphan_bob_real/temperature"
CAPABILITIES_URL = f"{BASE_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"

def verify_capabilities():
    print("=" * 60)
    print("1. Verifying GetCapabilities")
    print("=" * 60)
    print(f"Request: {CAPABILITIES_URL}")
    req = urllib.request.Request(CAPABILITIES_URL)
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200, f"Expected status 200, got {resp.status}"
        xml_bytes = resp.read()
    
    root = ET.fromstring(xml_bytes)
    ns = {"wms": "http://www.opengis.net/wms"}

    # Find temperature layer
    found_temp = False
    for layer in root.iter("{http://www.opengis.net/wms}Layer"):
        name_elem = layer.find("{http://www.opengis.net/wms}Name")
        if name_elem is not None and name_elem.text == "temperature":
            found_temp = True
            title_elem = layer.find("{http://www.opengis.net/wms}Title")
            print(f"Found Layer: name={name_elem.text}, title={title_elem.text if title_elem is not None else ''}")
            
            # Check CRS (in WMS 1.3.0, child layers inherit CRS elements declared on root/parent Layer)
            all_crs = [elem.text for elem in root.iter("{http://www.opengis.net/wms}CRS")]
            print(f"Supported CRS list: {all_crs[:5]}... (CRS:84 in list: {'CRS:84' in all_crs})")
            assert "CRS:84" in all_crs, "CRS:84 not found in supported CRS list!"

            # Check Dimensions: time and elevation
            for dim in layer.findall("{http://www.opengis.net/wms}Dimension"):
                d_name = dim.get("name")
                d_units = dim.get("units")
                d_default = dim.get("default")
                print(f"Dimension '{d_name}': units='{d_units}', default='{d_default}'")
                vals = [v.strip() for v in (dim.text or "").split(",") if v.strip()]
                print(f"  Available values count: {len(vals)}")
                print(f"  First 3: {vals[:3]}")
                print(f"  Last 3:  {vals[-3:]}")
    
    assert found_temp, "Layer 'temperature' not found in GetCapabilities!"
    print("GetCapabilities check PASSED.\n")

def test_getmap(time_str: str, elevation: float, output_name: str):
    # CONTRACTS.md Section 2 parameter format:
    # http://localhost:8080/thredds/wms/amphan_bob/temperature?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=temperature&STYLES=&CRS=CRS:84&BBOX=82.0,8.0,92.0,23.0&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&TIME=2020-05-18T00:00:00Z&ELEVATION=5.0
    
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": "temperature",
        "STYLES": "",
        "CRS": "CRS:84",
        "BBOX": "82.0,8.0,92.0,23.0",
        "WIDTH": "256",
        "HEIGHT": "256",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "TIME": time_str,
        "ELEVATION": str(elevation),
    }
    
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    getmap_url = f"{BASE_URL}?{query}"
    print(f"GetMap URL: {getmap_url}")

    req = urllib.request.Request(getmap_url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        content_type = resp.headers.get("Content-Type")
        print(f"Response status: {resp.status}, Content-Type: {content_type}")
        assert resp.status == 200, f"Expected status 200, got {resp.status}"
        assert "image/png" in content_type, f"Expected image/png, got {content_type}"
        img_bytes = resp.read()

    print(f"Downloaded image size: {len(img_bytes)} bytes")
    img = Image.open(io.BytesIO(img_bytes))
    print(f"Image format: {img.format}, size: {img.size}, mode: {img.mode}")

    # Inspect colors: check non-transparent pixel count
    rgba_img = img.convert("RGBA")
    non_transparent = [p for p in rgba_img.getdata() if p[3] > 0]
    print(f"Non-transparent pixels: {len(non_transparent)} / {img.size[0] * img.size[1]} ({len(non_transparent)/(img.size[0]*img.size[1])*100:.1f}%)")

    os.makedirs("tds/logs", exist_ok=True)
    out_path = os.path.join("tds", "logs", output_name)
    img.save(out_path)
    print(f"Saved test image to {out_path}\n")
    return img, non_transparent

def main():
    import urllib.parse
    verify_capabilities()

    print("=" * 60)
    print("2. Testing GetMap across Depth Levels (ELEVATION)")
    print("=" * 60)
    # Test Surface level (0.494m) vs deep level (100m, 500m) on 2020-05-18
    # Real GLORYS depths: 0.494, 1.541, ..., 92.326, ..., 5727.917
    img_surface, px_surface = test_getmap("2020-05-18T00:00:00.000Z", 0.494, "real_surface_temp_20200518.png")
    img_depth, px_depth = test_getmap("2020-05-18T00:00:00.000Z", 92.326, "real_92m_temp_20200518.png")
    img_deep, px_deep = test_getmap("2020-05-18T00:00:00.000Z", 453.938, "real_453m_temp_20200518.png")

    print("=" * 60)
    print("3. Testing GetMap across Time (TIME)")
    print("=" * 60)
    # Before cyclone (2020-05-14) vs during/after cyclone (2020-05-20)
    img_t1, px_t1 = test_getmap("2020-05-14T00:00:00.000Z", 0.494, "real_surface_temp_20200514.png")
    img_t2, px_t2 = test_getmap("2020-05-20T00:00:00.000Z", 0.494, "real_surface_temp_20200520.png")

    # Verify that surface image is not identical to 92m or 453m depth image (proves ELEVATION works!)
    surface_bytes = img_surface.tobytes()
    depth_bytes = img_depth.tobytes()
    deep_bytes = img_deep.tobytes()
    assert surface_bytes != depth_bytes, "Surface image and 92m depth image should have different pixel data!"
    assert depth_bytes != deep_bytes, "92m and 453m depth images should have different pixel data!"
    print("ELEVATION variation verified: different depths produce different ocean temperature renderings.")

    # Verify that t1 is not identical to t2 (proves TIME works!)
    t1_bytes = img_t1.tobytes()
    t2_bytes = img_t2.tobytes()
    assert t1_bytes != t2_bytes, "Time 2020-05-14 and 2020-05-20 should have different pixel data!"
    print("TIME variation verified: different dates produce distinct ocean temperature fields.")

    print("\nALL TDS WMS EMPIRICAL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
