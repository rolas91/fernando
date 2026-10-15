from pathlib import Path
import json
from pypdf import PdfReader
import pypdfium2 as pdfium

folder = Path('C:/workspace/fernando/output/pdf/wo-api-20261015')
checks = []
for filename, expected in [
    ('before-final-ASN-2026-0001.pdf', 'ASN-2026-0001'),
    ('after-final-000002.pdf', '000002'),
    ('before-builder-preview.pdf', 'ASN-2026-0001'),
    ('after-builder-preview.pdf', '000002'),
    ('before-regenerated-after-settings.pdf', 'ASN-2026-0001'),
]:
    path = folder / filename
    reader = PdfReader(path)
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    assert expected in text, (filename, expected)
    if filename.startswith('after'):
        assert 'ASN-2026-001' not in text
    document = pdfium.PdfDocument(str(path))
    for index in range(len(document)):
        page = document[index]
        page.render(scale=1.5).to_pil().save(folder / f'{path.stem}-page-{index+1}.png')
        page.close()
    document.close()
    (folder / f'{path.stem}.txt').write_text(text, encoding='utf-8')
    checks.append({'file': filename, 'pages': len(reader.pages), 'number': expected, 'extractedTextMatches': True})
(folder / 'pdf-verification.json').write_text(json.dumps(checks, indent=2), encoding='utf-8')
print(json.dumps(checks, indent=2))
