from pathlib import Path
import json
import sys
from pypdf import PdfReader
import pypdfium2 as pdfium

folder = Path(sys.argv[1]).resolve()
evidence = json.loads((folder / 'evidence.json').read_text(encoding='utf-8'))
for result in evidence['results']:
    file = folder / result['file']
    text = '\n'.join(page.extract_text() or '' for page in PdfReader(file).pages)
    number = result['submissionNumber']
    assert number and number in text
    assert 'No.  ' + result['assignmentNumber'] not in text
    doc = pdfium.PdfDocument(str(file))
    for index in range(len(doc)):
        page = doc[index]
        page.render(scale=1.5).to_pil().save(folder / f'{file.stem}-page-{index+1}.png')
        page.close()
    doc.close()
    print(file.name, number, 'verified')
regenerated = PdfReader(folder / 'shift-1-regenerated.pdf')
assert evidence['results'][0]['submissionNumber'] in regenerated.pages[0].extract_text()
