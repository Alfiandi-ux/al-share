"""
Al-share Pure Python QR Code Generator
Fully self-contained: No pip dependencies, no external libraries.
Supports Version 1 to 10 with Byte Encoding and Error Correction.
Can output ANSI/Unicode blocks for Terminal and SVG for Web.
"""

# Galois Field GF(256) tables for QR Reed-Solomon calculations
GF_EXP = [0] * 512
GF_LOG = [0] * 256

def _init_gf():
    x = 1
    for i in range(255):
        GF_EXP[i] = x
        GF_LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        GF_EXP[i] = GF_EXP[i - 255]

_init_gf()

def gf_mul(x, y):
    if x == 0 or y == 0:
        return 0
    return GF_EXP[GF_LOG[x] + GF_LOG[y]]

def rs_generator_poly(nsym):
    g = [1]
    for i in range(nsym):
        # g(x) * (x - alpha^i)
        root = GF_EXP[i]
        new_g = [0] * (len(g) + 1)
        for j in range(len(g)):
            new_g[j] ^= gf_mul(g[j], root)
            new_g[j + 1] ^= g[j]
        g = new_g
    return g

def rs_encode(data, nsym):
    gen = rs_generator_poly(nsym)
    res = list(data) + [0] * nsym
    for i in range(len(data)):
        coef = res[i]
        if coef != 0:
            for j in range(len(gen)):
                res[i + j] ^= gf_mul(gen[j], coef)
    return res[len(data):]

# Table of QR Code capacities and EC parameters for Byte Mode, Level L & M
# Format: (version, total_codewords, ec_codewords_per_block, num_blocks_g1, num_blocks_g2, data_codewords_g1, data_codewords_g2)
# Here using Level M for good scan reliability on phone screens
QR_SPECS_M = {
    1:  (26, 10, 1, 0, 16, 0),
    2:  (44, 16, 1, 0, 28, 0),
    3:  (70, 26, 1, 0, 44, 0),
    4:  (100, 18, 2, 0, 32, 0),
    5:  (134, 24, 2, 0, 43, 0),
    6:  (172, 16, 4, 0, 27, 0),
    7:  (196, 18, 4, 0, 31, 0),
    8:  (242, 22, 2, 2, 38, 39),
    9:  (292, 22, 3, 2, 36, 37),
    10: (346, 26, 4, 1, 43, 44),
}

ALIGNMENT_PATTERNS = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
}

FORMAT_BITS_M = {
    0: 0x5412,
    1: 0x5125,
    2: 0x5e7c,
    3: 0x5b4b,
    4: 0x45f9,
    5: 0x40ce,
    6: 0x4f97,
    7: 0x4aa0,
}

class QRCode:
    def __init__(self, data: str):
        self.data = data.encode('utf-8')
        self.version = self._select_version(len(self.data))
        self.size = 17 + 4 * self.version
        self.modules = [[None] * self.size for _ in range(self.size)]
        self.is_function = [[False] * self.size for _ in range(self.size)]
        self._build()

    def _select_version(self, data_len):
        for v in range(1, 11):
            spec = QR_SPECS_M[v]
            _, ec_len, b1, b2, d1, d2 = spec
            total_data = b1 * d1 + b2 * d2
            # Byte mode overhead: 4 bits mode + (8 if v<10 else 16) length bits
            overhead = 4 + (8 if v < 10 else 16)
            max_bytes = total_data - (overhead + 7) // 8
            if data_len <= max_bytes:
                return v
        return 10  # fallback

    def _encode_data(self):
        spec = QR_SPECS_M[self.version]
        _, ec_len, b1, b2, d1, d2 = spec
        total_data = b1 * d1 + b2 * d2

        # 1. Mode indicator (0100 for Byte mode)
        bits = "0100"
        # 2. Character count indicator
        count_len = 8 if self.version < 10 else 16
        bits += format(len(self.data), f'0{count_len}b')
        # 3. Data bytes
        for b in self.data:
            bits += format(b, '08b')
        # 4. Terminator (up to 4 zeros)
        needed = total_data * 8
        rem = needed - len(bits)
        if rem > 0:
            bits += '0' * min(4, rem)
        # 5. Make length multiple of 8
        if len(bits) % 8 != 0:
            bits += '0' * (8 - (len(bits) % 8))
        # 6. Pad bytes 0xEC, 0x11
        pads = [0xEC, 0x11]
        pad_idx = 0
        while len(bits) < needed:
            bits += format(pads[pad_idx % 2], '08b')
            pad_idx += 1

        # Split into codewords
        codewords = [int(bits[i:i+8], 2) for i in range(0, len(bits), 8)]

        # Split into blocks & compute EC
        blocks_data = []
        blocks_ec = []
        offset = 0
        for _ in range(b1):
            chunk = codewords[offset:offset+d1]
            blocks_data.append(chunk)
            blocks_ec.append(rs_encode(chunk, ec_len))
            offset += d1
        for _ in range(b2):
            chunk = codewords[offset:offset+d2]
            blocks_data.append(chunk)
            blocks_ec.append(rs_encode(chunk, ec_len))
            offset += d2

        # Interleave data codewords
        interleaved = []
        max_d = max(d1, d2)
        for i in range(max_d):
            for b in blocks_data:
                if i < len(b):
                    interleaved.append(b[i])
        # Interleave EC codewords
        for i in range(ec_len):
            for b in blocks_ec:
                interleaved.append(b[i])

        # Convert to bitstream
        final_bits = ""
        for cw in interleaved:
            final_bits += format(cw, '08b')
        # Remainder bits (for versions 2-6: 7 bits)
        remainder_bits = {1:0, 2:7, 3:7, 4:7, 5:7, 6:7, 7:0, 8:0, 9:0, 10:0}.get(self.version, 0)
        final_bits += '0' * remainder_bits
        return final_bits

    def _mark_finder(self, row, col):
        for r in range(-1, 8):
            for c in range(-1, 8):
                nr, nc = row + r, col + c
                if 0 <= nr < self.size and 0 <= nc < self.size:
                    self.is_function[nr][nc] = True
                    if 0 <= r <= 6 and 0 <= c <= 6:
                        if r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4):
                            self.modules[nr][nc] = True
                        else:
                            self.modules[nr][nc] = False
                    else:
                        self.modules[nr][nc] = False

    def _mark_alignment(self, row, col):
        for r in range(-2, 3):
            for c in range(-2, 3):
                nr, nc = row + r, col + c
                self.is_function[nr][nc] = True
                if abs(r) == 2 or abs(c) == 2 or (r == 0 and c == 0):
                    self.modules[nr][nc] = True
                else:
                    self.modules[nr][nc] = False

    def _build(self):
        # 1. Finder patterns
        self._mark_finder(0, 0)
        self._mark_finder(0, self.size - 7)
        self._mark_finder(self.size - 7, 0)

        # 2. Timing patterns
        for i in range(8, self.size - 8):
            self.is_function[6][i] = True
            self.modules[6][i] = (i % 2 == 0)
            self.is_function[i][6] = True
            self.modules[i][6] = (i % 2 == 0)

        # 3. Alignment patterns
        align = ALIGNMENT_PATTERNS.get(self.version, [])
        for r in align:
            for c in align:
                if self.modules[r][c] is not None:
                    continue
                self._mark_alignment(r, c)

        # 4. Dark module
        self.is_function[4 * self.version + 9][8] = True
        self.modules[4 * self.version + 9][8] = True

        # 5. Format info reserve
        for i in range(9):
            self.is_function[8][i] = True
            self.is_function[i][8] = True
        for i in range(self.size - 8, self.size):
            self.is_function[8][i] = True
        for i in range(self.size - 7, self.size):
            self.is_function[i][8] = True

        # 6. Place data bits
        data_bits = self._encode_data()
        bit_idx = 0
        bit_len = len(data_bits)

        # Zig-zag upwards & downwards
        col = self.size - 1
        upward = True
        while col > 0:
            if col == 6:
                col -= 1  # Skip timing vertical column
            rows = range(self.size - 1, -1, -1) if upward else range(self.size)
            for r in rows:
                for c in (col, col - 1):
                    if not self.is_function[r][c]:
                        if bit_idx < bit_len:
                            self.modules[r][c] = (data_bits[bit_idx] == '1')
                            bit_idx += 1
                        else:
                            self.modules[r][c] = False
            upward = not upward
            col -= 2

        # 7. Apply standard mask (Pattern 0: (row + col) % 2 == 0)
        mask = 0
        for r in range(self.size):
            for c in range(self.size):
                if not self.is_function[r][c]:
                    if (r + c) % 2 == 0:
                        self.modules[r][c] = not self.modules[r][c]

        # 8. Write format bits
        fmt = FORMAT_BITS_M[mask]
        fmt_bits = format(fmt, '015b')
        # Around top-left finder
        coords_tl = [
            (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8),
            (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)
        ]
        for idx, (r, c) in enumerate(coords_tl):
            self.modules[r][c] = (fmt_bits[idx] == '1')

        # Split across top-right & bottom-left
        for idx in range(7):
            self.modules[8][self.size - 1 - idx] = (fmt_bits[idx] == '1')
        for idx in range(7, 15):
            self.modules[self.size - 15 + idx][8] = (fmt_bits[idx] == '1')

    def to_terminal(self, quiet_zone=2) -> str:
        """
        Renders a super-clean, high-contrast QR code for terminals using
        Unicode half-block characters (▀ and ▄). 
        This fits neatly on phone Termux screens!
        """
        matrix = []
        total_size = self.size + 2 * quiet_zone

        # Pad with quiet zone
        for r in range(total_size):
            row = []
            for c in range(total_size):
                orig_r = r - quiet_zone
                orig_c = c - quiet_zone
                if 0 <= orig_r < self.size and 0 <= orig_c < self.size:
                    row.append(bool(self.modules[orig_r][orig_c]))
                else:
                    row.append(False)
            matrix.append(row)

        output = []
        # Process two vertical rows at a time
        for r in range(0, total_size, 2):
            line = []
            for c in range(total_size):
                top = matrix[r][c]
                bot = matrix[r + 1][c] if r + 1 < total_size else False
                if top and bot:
                    line.append(' ')      # Dark/Dark (inverted in white terminal, or standard)
                elif top and not bot:
                    line.append('▄')      # Dark top, Light bottom
                elif not top and bot:
                    line.append('▀')      # Light top, Dark bottom
                else:
                    line.append('█')      # Light/Light
            output.append("  " + "".join(line))
        return "\n".join(output)

    def to_svg(self, pixel_size=10, quiet_zone=4) -> str:
        """
        Generates an SVG representation.
        """
        total = (self.size + 2 * quiet_zone) * pixel_size
        rects = []
        for r in range(self.size):
            for c in range(self.size):
                if self.modules[r][c]:
                    x = (c + quiet_zone) * pixel_size
                    y = (r + quiet_zone) * pixel_size
                    rects.append(f'<rect x="{x}" y="{y}" width="{pixel_size}" height="{pixel_size}" fill="#0f172a" />')
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" '
            f'width="{total}" height="{total}">'
            f'<rect width="100%" height="100%" fill="#ffffff" rx="16"/>'
            + "".join(rects) +
            '</svg>'
        )

def generate_terminal_qr(url: str) -> str:
    """Helper function to quickly generate a terminal-ready QR code."""
    try:
        qr = QRCode(url)
        return qr.to_terminal()
    except Exception as e:
        return f"[QR Code could not be displayed: {e}]"

def generate_svg_qr(url: str) -> str:
    """Helper function to quickly generate an SVG QR code."""
    qr = QRCode(url)
    return qr.to_svg()
