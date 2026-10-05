import re


def license_code(value):
    value = str(value).upper().strip()
    if "PUBLICDOMAIN/ZERO" in value or value.startswith("CC0"):
        return "CC0"
    match = re.search(r"(?:LICENSES/|CC-)(BY-SA|BY-NC-SA|BY-NC|BY-ND|BY)(?:/|[- ]|$)", value)
    return "CC-" + match.group(1) if match else value


def allowed_media(items, allowed):
    result = []
    for m in items:
        license = license_code(m.get("license", ""))
        url = m.get("identifier") or m.get("url")
        creator = m.get("creator")
        if license not in allowed or not url or (license != "CC0" and not creator):
            continue
        if not (url.startswith("https://") or url.startswith("/worlds/")):
            continue
        result.append(
            {
                "url": url,
                "thumbnail_url": m.get("thumbnail_url", url),
                "creator": creator or "Public domain",
                "source": m.get("references", m.get("source", "")),
                "license": license,
                "attribution": m.get("attribution") or f"{creator or 'Public domain'} · {license}",
            }
        )
    return result
