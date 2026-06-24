#!/usr/bin/env python3
"""Bundle a Design AX Brief page into ONE self-contained HTML file.
Inlines Geist CSS + _ds bundle + data + app + coffee widget, and embeds every
image (data + assets) as a base64 data: URI. React/Babel/Pretendard stay on CDN."""
import base64, os, re, sys

REPO = "."
DS = "_ds/vercel-geist-design-system-c2ba0d99-87b1-4991-ab2e-5e49c7f778db"
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if os.path.basename(os.getcwd())=="tools" else ".")

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def mime(path):
    e = path.lower().rsplit(".", 1)[-1]
    return {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "gif": "image/gif"}.get(e, "application/octet-stream")

def data_uri(path):
    with open(path, "rb") as f:
        b = base64.b64encode(f.read()).decode("ascii")
    return "data:%s;base64,%s" % (mime(path), b)

def embed_images(js, paths):
    """Replace each local image path string with its data URI (longest first)."""
    for p in sorted(set(paths), key=len, reverse=True):
        if os.path.exists(p):
            js = js.replace(p, data_uri(p))
        else:
            print("  [warn] missing image:", p)
    return js

# ---- CSS: concat in <link> order; keep fonts.css Google-Fonts @import, drop the
#      relative tokens/*.css @imports (those token files are inlined separately). ----
CSS_ORDER = ["tokens/fonts.css", "tokens/colors.css", "tokens/typography.css",
             "tokens/spacing.css", "tokens/shapes.css", "tokens/elevation.css", "styles.css"]
def build_css():
    out = []
    for rel in CSS_ORDER:
        css = read(os.path.join(DS, rel))
        css = re.sub(r"@import\s+url\(['\"]tokens/[^)]+['\"]\);?", "", css)  # strip relative token imports
        out.append("/* %s */\n%s" % (rel, css))
    return "\n".join(out)

def collect_data_image_paths(data_js):
    return re.findall(r'"image":\s*"([^"]+)"', data_js)

def build(app_jsx, title, out_path):
    css = build_css()
    bundle = read(os.path.join(DS, "_ds_bundle.js"))
    data_js = read("axbrief-data.js")
    data_js = embed_images(data_js, collect_data_image_paths(data_js))
    coffee = read("coffee-button.js")
    coffee = embed_images(coffee, ["assets/coffee.jpg", "assets/linktoQR.png"])
    app = read(app_jsx)

    html = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%(title)s</title>
<!-- Pretendard (CDN) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<!-- Geist design-system CSS (inlined) -->
<style>
%(css)s
</style>
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #f1ece4; overflow-x: hidden; }
  * { box-sizing: border-box; }
</style>
</head>
<body>
<div id="root"></div>

<!-- React + Babel (pinned CDN) -->
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

<!-- Geist component bundle (inlined) -->
<script>
%(bundle)s
</script>

<!-- Data (inlined; images embedded as data URIs) -->
<script>
%(data)s
</script>

<!-- App (inlined, Babel) -->
<script type="text/babel">
%(app)s
</script>

<script type="text/babel">
  const { ThemedPage } = window;
  ReactDOM.createRoot(document.getElementById('root')).render(<ThemedPage themeKey="zen" />);
</script>

<!-- Coffee → QR donation button (inlined; assets embedded) -->
<script>
%(coffee)s
</script>
</body>
</html>
""" % {"title": title, "css": css, "bundle": bundle, "data": data_js, "app": app, "coffee": coffee}

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("  wrote %s  (%.1f MB)" % (out_path, len(html.encode("utf-8")) / 1e6))

print("small:")
build("axbrief-app.jsx",       "Design AX Brief — Small Card",  "standalone/Design AX Brief (Small Card).html")
print("large:")
build("axbrief-app-large.jsx", "Design AX Brief — Large Card",  "standalone/Design AX Brief (Large Card).html")
print("done.")
