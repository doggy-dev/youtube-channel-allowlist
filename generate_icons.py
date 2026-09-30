import zlib
import struct
import math
import os

def create_png(width, height, draw_fn):
    raw_data = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            idx = (y * width + x) * 4
            raw_data[idx] = r
            raw_data[idx + 1] = g
            raw_data[idx + 2] = b
            raw_data[idx + 3] = a
            
    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)
        start = y * width * 4
        end = start + width * 4
        scanlines.extend(raw_data[start:end])
        
    compressed = zlib.compress(bytes(scanlines))
    
    def chunk(tag, data):
        length = len(data)
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', length) + tag + data + struct.pack('>I', crc)
        
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def draw_popup_blocker_icon(x, y, w, h):
    nx = (x + 0.5 - w / 2) / (w / 2)
    ny = (y + 0.5 - h / 2) / (h / 2)
    dist = math.sqrt(nx * nx + ny * ny)
    
    if dist > 0.94:
        return (0, 0, 0, 0)
    
    alpha = 255
    if dist > 0.88:
        alpha = int(255 * (0.94 - dist) / 0.06)
        
    # Blue gradient (Brave/Chrome style popup blocker blue)
    grad = (ny + 1) / 2.0
    r = int(37 - grad * 20)
    g = int(99 + grad * 15)
    b = int(235 - grad * 30)

    # Draw a browser window outline with a slash or blocked symbol
    # Window rect: nx in [-0.5, 0.5], ny in [-0.45, 0.45]
    in_win_x = -0.52 <= nx <= 0.52
    in_win_y = -0.45 <= ny <= 0.45
    border_thick = 0.12
    
    is_border = in_win_x and in_win_y and (
        abs(nx - (-0.52)) < border_thick or abs(nx - 0.52) < border_thick or
        abs(ny - (-0.45)) < border_thick or abs(ny - 0.45) < border_thick or
        abs(ny - (-0.18)) < border_thick * 0.7 # header separator
    )
    
    # Block slash from top-right to bottom-left: (0.4, -0.35) to (-0.4, 0.35)
    def dist_to_segment(px, py, x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        l2 = dx*dx + dy*dy
        if l2 == 0: return math.hypot(px - x1, py - y1)
        t = max(0, min(1, ((px - x1)*dx + (py - y1)*dy) / l2))
        return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

    d_slash = dist_to_segment(nx, ny, 0.38, -0.32, -0.38, 0.32)
    is_slash = d_slash < 0.11

    if is_border or is_slash:
        # White element
        r = 255
        g = 255
        b = 255
        
    return (r, g, b, alpha)

if __name__ == '__main__':
    out_dir = r"C:\Users\Lenovo\.gemini\antigravity\scratch\youtube-whitelist-brave-plugin\icons"
    os.makedirs(out_dir, exist_ok=True)
    
    for size in [16, 32, 48, 128]:
        png_bytes = create_png(size, size, draw_popup_blocker_icon)
        file_path = os.path.join(out_dir, f"icon{size}.png")
        with open(file_path, "wb") as f:
            f.write(png_bytes)
        print(f"Generated {file_path}")
