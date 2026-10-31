"""SHA-fixed 2007-2014 descriptive-only page boundaries (never used for MC grading).

These 16 PDFs have no reliable text layer. Their exam headings were located by
page image inspection plus independent OCR of all pages. Page intervals include
only the relevant question pages, excluding the trailing function table and
answer-sheet sample. The PDF remains available for source verification.

Tuple: (original PDF SHA-256, full PDF page count, {question number:(first,last)}).
The 2007-2008 website filenames invert the current am/pm labels: source PDFs
were assigned here by 11-question vs 22-question section, not filename.
"""

SCANNED_DESCRIPTIVE = {
    2007: {
        "午前の部": ("4ba49614f2362f5f88257dd9645868c49f8a05f318ba9fb5658163586ef2d15e", 14, {11:(11,12)}),
        "午後の部": ("d9b03f5e3ab434e3e323baa87d1174262389e48eec08ad0a38ecd9c8c8ac29aa", 30, {21:(21,25),22:(26,29)}),
    },
    2008: {
        "午前の部": ("7d3d4652f14c978cf7d5912426fe6dfcca9364897d2b78dc2022903fbcaf3d6d", 14, {11:(11,12)}),
        "午後の部": ("f0fa3edd7462534b15317fe81a7e6b9bda80113398fe6ca26ad03b0b19a750d5", 30, {21:(21,25),22:(26,29)}),
    },
    2009: {
        "午前の部": ("f6156476c7e694736687f030751bb75bb593a0a661d78419c552f1887aeecd97", 16, {11:(13,14)}),
        "午後の部": ("15d47f6f49d4acb93f58ac0307645f34bc9481e664b69ea8b6b82e5bd0b14535", 32, {21:(23,28),22:(29,31)}),
    },
    2010: {
        "午前の部": ("4b54360ef36c2d9c195677cda258c33892b903f08fde3ddc7c1a1189eaf581a1", 16, {11:(13,14)}),
        "午後の部": ("eefd4b1ebcc88ab5d4a18b876fe4d8e48cbc312c5eefc3ac76e7080ef16bc4a2", 35, {21:(23,28),22:(29,34)}),
    },
    2011: {
        "午前の部": ("4d6f9d997b1b54427f4d68c26c3f2d0b9a9ef37d3a47d1309cb38815918d0a37", 16, {11:(13,14)}),
        "午後の部": ("16b90155024afaff04ee1375ec1a2b57a8377bfb67036671fc086407efb54005", 36, {21:(23,28),22:(29,35)}),
    },
    2012: {
        "午前の部": ("adf39e538daab75b8a2ff42ca5577dc116c774e9385bc4bd39d0aadd4fe71bcf", 16, {11:(12,14)}),
        "午後の部": ("d4523d3ae584608cf8d59cbe36ee4afe1ac0ee248d89e0ea878aaa11cdee9e9f", 38, {21:(22,31),22:(32,37)}),
    },
    2013: {
        "午前の部": ("c683d1e966142d01c30755301d9c644dd5e193017da132d41499abee01d25e27", 16, {11:(13,14)}),
        "午後の部": ("6bdcebbb0aae372b7afcd0ebc3bbf35b0b95a624e2b466f17c6df652252da583", 35, {21:(22,28),22:(29,34)}),
    },
    2014: {
        "午前の部": ("f585fa579b533ef1058817f457e5b0684e4fe71b279d58f858a9d802c5b0f766", 15, {11:(12,13)}),
        "午後の部": ("8244f6cffbf1cc14560e4238a79ac77bf06e84902187cb0448b247e687197eb3", 38, {21:(22,30),22:(31,37)}),
    },
}
